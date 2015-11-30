var fs = require("fs"),
    hc_path = "../index.js",
    hithercontent = require(hc_path),
    auth = JSON.parse(fs.readFileSync("_auth.json", { "encoding": "utf8" })),
    expect = require("chai").expect,
    https = require("https"),
    sinon = require("sinon"),
    PassThrough = require("stream").PassThrough;

var project_overview = {
    "data": [
        { "id": 1, "parent_id": 0 },
        { "id": 2, "parent_id": 0 },
        { "id": 11, "parent_id": 1 },
        { "id": 12, "parent_id": 1 },
        { "id": 21, "parent_id": 2 },
        { "id": 22, "parent_id": 2 },
        { "id": 221, "parent_id": 22 }
    ]
};

var project_content = {
    "1": { "data": { "id": 1, "config": [ { "label": "First tab", "elements": [ { "type": "text", "label": "Text element", "value": "Lorem ipsum" } ] } ] } },
    "2": { "data": { "id": 2, "config": [ { "label": "First tab", "elements": [ { "type": "text", "label": "Text element", "value": "Lorem ipsum" } ] } ] } },
    "11": { "data": { "id": 11, "config": [ { "label": "First tab", "elements": [ { "type": "text", "label": "Text element", "value": "Lorem ipsum" } ] } ] } },
    "12": { "data": { "id": 12, "config": [ { "label": "First tab", "elements": [ { "type": "text", "label": "Text element", "value": "Lorem ipsum" } ] } ] } },
    "21": { "data": { "id": 21, "config": [ { "label": "First tab", "elements": [ { "type": "text", "label": "Text element", "value": "Lorem ipsum" } ] } ] } },
    "22": { "data": { "id": 22, "config": [ { "label": "First tab", "elements": [ { "type": "text", "label": "Text element", "value": "Lorem ipsum" } ] } ] } },
    "221": { "data": { "id": 221, "config": [ { "label": "First tab", "elements": [ { "type": "text", "label": "Text element", "value": "Lorem ipsum" } ] } ] } }
};

describe("Using the branch selector", function () {

    before(function () {
        hithercontent.init(auth);
    });

    after(function() {
        hithercontent.reset()
    })

    beforeEach("using mock API to approximate GatherContent", function () {
        sinon.stub(https, "get", function (options, callback) {
            var request = new PassThrough(),
                response = new PassThrough(),
                auth_check = auth.user + ":" + auth.akey,
                path = options.hasOwnProperty("path") && options.path,
                item_number;
            if (typeof callback === "function") {
                callback(response);
            }
            if (options.hasOwnProperty("auth") && (options.auth === auth_check)) {
                if (path === "/items?project_id=111111") {
                    response.write(JSON.stringify(project_overview));
                } else if (item_number = path.match(/\/items\/(.*)/)) {
                    if (project_content.hasOwnProperty(item_number[1])) {
                        response.write(JSON.stringify(project_content[item_number[1]]));
                    }
                }
            } else {
                response.write("Invalid credentials.")
            }
            response.end();
            return request;
        });
    });

    afterEach("restoring real API call", function () {
        https.get.restore();
    });

    describe("without specifiying an item id", function() {
        it("should return an object", function (done) {
            hithercontent.getProjectBranch(111111, function (branch) {
                expect(branch).to.be.an("object");
                done();
            });
        });

        it("should return an object with an items property", function (done) {
            hithercontent.getProjectBranch(111111, function (branch) {
                expect(branch).to.have.keys("items");
                done();
            });
        });

        it("should return an object with an items property containing only the top-level items", function (done) {
            hithercontent.getProjectBranch(111111, function (branch) {
                expect(branch.items).to.have.length(2);
                done();
            });
        });

        describe("but with the `reduceItemToKVPairs` function acting on each item", function () {
            it("should return an object", function (done) {
                hithercontent.getProjectBranch(111111, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch).to.be.an("object");
                    done();
                });
            });

            it("should return an object with an items property", function (done) {
                hithercontent.getProjectBranch(111111, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch).to.have.keys("items");
                    done();
                });
            });

            it("should return an object with an items property containing only the top-level items", function (done) {
                hithercontent.getProjectBranch(111111, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch.items).to.have.length(2);
                    done();
                });
            });
        });
    });

    describe("while specifiying an item id", function() {
        it("should return an object", function (done) {
            hithercontent.getProjectBranch(111111, 2, function (branch) {
                expect(branch).to.be.an("object");
                done();
            });
        });

        it("should return an object with an items property", function (done) {
            hithercontent.getProjectBranch(111111, 2, function (branch) {
                expect(branch).to.have.keys("items");
                done();
            });
        });

        it("should return an object with an items property has only one item", function (done) {
            hithercontent.getProjectBranch(111111, 2, function (branch) {
                expect(branch.items).to.have.length(1);
                done();
            });
        });

        it("should return an object with an items property whose first item shares the same id as that requested", function (done) {
            hithercontent.getProjectBranch(111111, 2, function (branch) {
                expect(branch.items[0]).to.have.property("id", 2);
                done();
            });
        });

        describe("but with the `reduceItemToKVPairs` function acting on each item", function () {
            it("should return an object", function (done) {
                hithercontent.getProjectBranch(111111, 2, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch).to.be.an("object");
                    done();
                });
            });

            it("should return an object with an items property", function (done) {
                hithercontent.getProjectBranch(111111, 2, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch).to.have.keys("items");
                    done();
                });
            });

            it("should return an object with an items property has only one item", function (done) {
                hithercontent.getProjectBranch(111111, 2, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch.items).to.have.length(1);
                    done();
                });
            });

            it("should return an object with an items property whose first item shares the same id as that requested", function (done) {
                hithercontent.getProjectBranch(111111, 2, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch.items[0]).to.have.property("_id", 2);
                    done();
                });
            });
        });
    });

    describe("while specifiying an item that has no children", function() {
        it("should return an object", function (done) {
            hithercontent.getProjectBranch(111111, 221, function (branch) {
                expect(branch).to.be.an("object");
                done();
            });
        });

        it("should return an object with an items property", function (done) {
            hithercontent.getProjectBranch(111111, 221, function (branch) {
                expect(branch).to.have.keys("items");
                done();
            });
        });

        it("should return an object with just one item", function (done) {
            hithercontent.getProjectBranch(111111, 221, function (branch) {
                expect(branch.items).to.have.length(1);
                done();
            });
        });

        it("should return an object with an items property whose first item shares the same id as that requested", function (done) {
            hithercontent.getProjectBranch(111111, 221, function (branch) {
                expect(branch.items[0]).to.have.property("id", 221);
                done();
            });
        });

        it("should return an object with an items property whose first item has an empty items property of its own", function (done) {
            hithercontent.getProjectBranch(111111, 221, function (branch) {
                expect(branch.items[0].items).to.be.empty;
                done();
            });
        });

        describe("but with `reduceItemToKVPairs` function acting on each item", function () {
            it("should return an object", function (done) {
                hithercontent.getProjectBranch(111111, 221, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch).to.be.an("object");
                    done();
                });
            });

            it("should return an object with an items property", function (done) {
                hithercontent.getProjectBranch(111111, 221, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch).to.have.keys("items");
                    done();
                });
            });

            it("should return an object with just one item", function (done) {
                hithercontent.getProjectBranch(111111, 221, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch.items).to.have.length(1);
                    done();
                });
            });

            it("should return an object with an items property whose first item shares the same id as that requested", function (done) {
                hithercontent.getProjectBranch(111111, 221, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch.items[0]).to.have.property("_id", 221);
                    done();
                });
            });

            it("should return an object with an items property whose first item has an empty items property of its own", function (done) {
                hithercontent.getProjectBranch(111111, 221, hithercontent.reduceItemToKVPairs, function (branch) {
                    expect(branch.items[0]).to.not.have.property("items");
                    done();
                });
            });
        });
    });
});
