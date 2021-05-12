const fs = require('fs');
const base64 = require('base-64');
const fetch = require('node-fetch');
const path = require('path');
const async = require("async");

module.exports = (function () {

  var auth = {};

  var init = function (cred) {
    if (typeof cred === "object") {
      if (cred.hasOwnProperty("user") && typeof cred.user === "string") {
        auth.user = cred.user;
      }
      if (cred.hasOwnProperty("akey") && typeof cred.akey === "string") {
        auth.akey = cred.akey;
      }
    }
  }

  var reset = function (cred) {
      auth = {};
      init(cred);
  }

  function fetchWithErrorHandling(request) {
    const baseUrl = "https://api.gathercontent.com";
    const options = {
      headers: {
        'Authorization': 'Basic ' + base64.encode(auth.user + ':' + auth.akey),
        'Accept': 'application/vnd.gathercontent.v0.5+json'
      }
    };

    return fetch(baseUrl.concat(request), options)
      .then(res => {
        if (res.ok) {
          return res;
        }
        if (res.status === 429) {
          const retryAfter = res.headers.get('retry-after');
          console.log('Rate limit hit, retrying in ' + retryAfter);
          return new Promise(resolve => {
            setTimeout(() => {
              resolve(fetchWithErrorHandling(request))
            }, retryAfter * 1000)
          });
        } else {
          throw new Error(res.status + ' ' + res.statusText)
        }
      })
      .catch(console.log)
  }

  var getJSONfromAPI = function (request, callback = () => {}) {
    fetchWithErrorHandling(request)
      .then(res => res.json())
      .then(callback);
  };

  var reduceItemToKVPairs = function (d) {
    return d.hasOwnProperty("data") && typeof d.data === "object"
        ? flattenItemData(d.data)
        : {}
  };

  var flattenItemData = function (d) {
      var item = {},
          k;
      for (k in d) {
          if (k !== "config" && d.hasOwnProperty(k)) {
              item["_" + k.replace(/\s/g, "-")] = d[k]
          }
      }
      if (d.hasOwnProperty("config") && Array.isArray(d.config)) {
          d.config.forEach(function (v, i, a) {
              var tab_label = v.label;
              v.elements.forEach(function (v, i, a) {
                  var k = tab_label + "_" + (v.label || v.title);
                  k = k && k.replace(/\s/g, "-");
                  if (v.type === "text") {
                      item[k] = v.value;
                  } else if (v.type === "choice_radio") {
                      item[k] = v.options.filter(v => v.selected).reduce((p, c) => p + c.label, "");
                  } else if (v.type === "choice_checkbox") {
                      item[k] = v.options.filter(v => v.selected).map(v => v.label);
                  } else if (v.type === "section") {
                      item[k] = v.subtitle;
                  } else if (v.type === "files") {
                      console.log("files id'd", v.id, v.name, v.url)
                      item[k] = v.url
                  }
              });
          });
      }
      return item;
  }

  var getFilesForItem = function (item, callback) {
      var relevantElements = []
      if (typeof item.data != "undefined" && Array.isArray(item.data.config)) {
          item.data.config.forEach(c => {
              if (Array.isArray(c.elements)) {
                  relevantElements = relevantElements.concat(c.elements.filter(v => v.type === "files"))
              }
          })
      }

      if (relevantElements.length > 0) {
          getJSONfromAPI(`/items/${item.data.id}/files`, filesData => {
              // go through each item and match to element
              if (typeof filesData.data == 'undefined') {
                return;
              }
              filesData.data.forEach(f => {
                  relevantElements.forEach(e => {
                      if (f.field === e.name) {
                          e.url = Array.isArray(e.url) ? e.url.concat(f.url) : [f.url]
                          e.filename = Array.isArray(e.filename) ? e.filename.concat(f.filename) : [f.filename]
                
                          // Check whether to download the file.
                          if (f.file_id) {
                            // Determine the end filename
                            let realFilename = f.file_id.split('?', 1)[0]
                            realFilename = realFilename.split('#', 1)[0]
                            const dest = 'download/' + path.basename(realFilename + path.extname(f.filename));
                            if (!fs.existsSync(dest)) {
                              const options = {
                                method: 'GET',
                                headers: {
                                  'Authorization': 'Basic ' + base64.encode(auth.user + ':' + auth.akey),
                                  'Accept': 'application/vnd.gathercontent.v0.5+json'
                                }
                              };
                              fetch(`https://api.gathercontent.com/files/${f.id}/download`, options)
                                .then(function(res) {
                                  console.log('Saving', dest);
                                  const writeStream = fs.createWriteStream(dest);
                                  res.body.pipe(writeStream);
                                })
                            }
                            else {
                              console.log('Exists already:', dest);
                            }
                          }
                      }
                  })
              })
              callback(item)
          })
      } else {
        callback(item)
      }
  }

  var getProjectBranch = function (project_id, item_id, iterator, callback) {

      var finishBranch = (typeof callback === "function")
        ? callback
        : (typeof iterator === "function")
            ? iterator
            : (typeof item_id === "function")
                ? item_id
                : () => {},
        processItem = (typeof callback === "function")
            ? (typeof iterator === "function")
                ? iterator
                : i => i.data
            : (typeof iterator === "function")
                ? (typeof item_id === "function")
                    ? item_id
                    : i => i.data
                : i => i.data,
        item_id = (typeof item_id === "number") ? item_id : 0,
        project_id = (typeof project_id === "number") ? project_id : 0,
        root = { "items": [] };

      getJSONfromAPI("/items?project_id=" + project_id, function (project_data) {

          var getItem = function (root_id, tier, siblings_store, finishItem) {
              var storeItem = function (item) {
                      var item_data = processItem(item);
                      item_data.position = item_data.position || item.data.position || "0"
                      item_data.id = item_data.id || item.data.id || 0;
                      item_data.tier = item_data.tier || tier
                      siblings_store.push(item_data);
                      return item_data;
                  },
                  findChildItems = function (item_data) {
                      var child_items = project_data.data
                        .filter(i => i.parent_id === root_id);
                      item_data.items = []
                      async.each(child_items,
                          (i, finishChild) => {
                              getItem(i.id, tier + 1, item_data.items, finishChild)
                          },
                          () => {
                              item_data.items
                                .sort((a, b) => parseInt(a.position, 10) - parseInt(b.position, 10))
                              finishItem()
                          }
                      );
                  };
              if (root_id === 0) {
                  findChildItems(root);
              } else {
                  getJSONfromAPI("/items/" + root_id, item => findChildItems(storeItem(item)));
              }
          };

          getItem(item_id, item_id && 1, root.items, () => { finishBranch(root) });
      });
  };

  var getProjectBranchWithFileInfo = function (project_id, item_id, iterator, callback) {

      var finishBranch = (typeof callback === "function")
        ? callback
        : (typeof iterator === "function")
            ? iterator
            : (typeof item_id === "function")
                ? item_id
                : () => {},
        processItem = (typeof callback === "function")
            ? (typeof iterator === "function")
                ? iterator
                : i => i.data
            : (typeof iterator === "function")
                ? (typeof item_id === "function")
                    ? item_id
                    : i => i.data
                : i => i.data,
        item_id = (typeof item_id === "number") ? item_id : 0,
        project_id = (typeof project_id === "number") ? project_id : 0,
        root = { "items": [] };

      getJSONfromAPI("/items?project_id=" + project_id, function (project_data) {

          var getItem = function (root_id, tier, siblings_store, finishItem) {
              var storeItem = function (item) {
                      var item_data = processItem(item);
                      if (typeof item_data.position == 'undefined') {
                        item_data.position = "0";
                      }
                      if (typeof item_data.id == 'undefined') {
                        item_data.id = 0;
                      }
                      if (typeof item.data == 'undefined') {
                        item.data = {};
                        item.data.id = 0;
                      }
                      if (typeof item_data.tier == 'undefined') {
                        item_data.tier = tier;
                      }
                      item_data.position = item_data.position || item.data.position || "0"
                      item_data.id = item_data.id || item.data.id || 0;
                      item_data.tier = item_data.tier || tier
                      siblings_store.push(item_data);
                      return item_data;
                  },
                  findChildItems = function (item_data) {
                      var child_items = project_data.data
                        .filter(i => i.parent_id === root_id);
                      item_data.items = []
                      async.each(child_items,
                          (i, finishChild) => {
                              getItem(i.id, tier + 1, item_data.items, finishChild)
                          },
                          () => {
                              item_data.items
                                .sort((a, b) => parseInt(a.position, 10) - parseInt(b.position, 10))
                              finishItem()
                          }
                      );
                  };
              if (root_id === 0) {
                  findChildItems(root);
              } else {
                  getJSONfromAPI("/items/" + root_id, item => { getFilesForItem(item, (item) => { findChildItems(storeItem(item)) }) });
              }
          };

          getItem(item_id, item_id && 1, root.items, () => { finishBranch(root) });
      });
  };

  return {
    init: init,
    reset: reset,
    getJSONfromAPI: getJSONfromAPI,
    reduceItemToKVPairs: reduceItemToKVPairs,
    getProjectBranch: getProjectBranch,
    getProjectBranchWithFileInfo: getProjectBranchWithFileInfo,
    getFilesForItem: getFilesForItem
  }

}());
