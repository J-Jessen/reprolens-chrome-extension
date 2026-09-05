const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

require("../vendor/trace-mapping.js");
const SourceMapResolver = require("../source-map.js");

function generatedLineNumberFor(text) {
  const lines = fs.readFileSync(path.join(__dirname, "../demo-react/app.js"), "utf8").split("\n");
  const index = lines.findIndex((line) => line.includes(text));
  assert.notEqual(index, -1, `Expected generated bundle to contain ${text}`);
  return index;
}

test("maps the React request initiator back to authored JSX", async () => {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../demo-react/app.js.map"), "utf8"));
  const frame = {
    functionName: "handleReactCheckout",
    url: "http://127.0.0.1:4175/app.js",
    lineNumber: generatedLineNumberFor("const response = await fetch"),
    columnNumber: 29
  };
  const session = {
    handlers: [],
    network: [{ initiatorCallFrames: [frame] }],
    scripts: {
      "73": {
        url: "http://127.0.0.1:4175/app.js",
        sourceMapURL: "app.js.map"
      }
    }
  };

  const result = await SourceMapResolver.enrichSession(session, {
    fetchMap: async () => map
  });

  assert.equal(result.attempted, 1);
  assert.equal(result.mappedFrames, 1);
  assert.match(frame.originalLocation.source, /src\/main\.jsx$/);
  assert.equal(frame.originalLocation.lineNumber, 13);
  assert.equal(frame.originalLocation.name, "handleReactCheckout");
});

test("maps frames nested in an async timer stack", async () => {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../demo-react/app.js.map"), "utf8"));
  const frame = {
    functionName: "handleReactCheckout",
    scriptId: "73",
    url: "http://127.0.0.1:4175/app.js",
    lineNumber: generatedLineNumberFor("const response = await fetch"),
    columnNumber: 29
  };
  const session = {
    handlers: [],
    network: [],
    asyncEvents: [{
      callFrames: [],
      asyncStackTrace: { callFrames: [frame] }
    }],
    scripts: {
      "73": {
        url: "http://127.0.0.1:4175/app.js",
        sourceMapURL: "app.js.map"
      }
    }
  };

  const result = await SourceMapResolver.enrichSession(session, {
    fetchMap: async () => map
  });
  assert.equal(result.mappedFrames, 1);
  assert.match(frame.originalLocation.source, /src\/main\.jsx$/);
});
