const assert = require("node:assert/strict");
const test = require("node:test");
const CorpusEvaluator = require("../corpus-evaluator.js");

function baseTrace(timeline, extra = {}) {
  const metadata = { relationType: "observed-after-interaction", captureMethod: "test", privacyClassification: "test-metadata" };
  return {
    schemaVersion: 2,
    traceId: "test-trace",
    status: "complete",
    timeline: [
      { ...metadata, kind: "interaction", title: "click button", relationType: "root" },
      ...timeline.map((event) => ({ ...metadata, ...event }))
    ],
    ...extra
  };
}

test("passes a complete React timer trace", () => {
  const trace = baseTrace([
    { kind: "handler", title: "handleReactCheckout()", location: { originalLocation: { source: "src/main.jsx" } } },
    { kind: "request", title: "GET /order.json?reactTrace=1" },
    { id: "async-0", kind: "async", title: "setTimeout scheduled" },
    { id: "async-1", parentId: "async-0", kind: "async", title: "setTimeout callback" }
  ], {
    framework: {
      owner: "CheckoutCard",
      context: { valuesCaptured: false, props: [], state: [{ slot: 1, type: "string" }, { slot: 2, type: "null" }] }
    }
  });
  const result = CorpusEvaluator.evaluateTrace(trace, "react-timer");
  assert.equal(result.passed, true);
  assert.equal(result.score, 100);
});

test("reports the exact missing evidence for an incomplete failure trace", () => {
  const trace = baseTrace([
    { kind: "handler", title: "runFailingFetch()" },
    { kind: "request", title: "GET /missing-order.json" },
    { kind: "response", title: "404 /missing-order.json" }
  ]);
  const result = CorpusEvaluator.evaluateTrace(trace, "fetch-failure");
  assert.equal(result.passed, false);
  assert.deepEqual(result.checks.filter((check) => !check.passed).map((check) => check.id), ["error", "mutation"]);
});

test("distinguishes mapped and deliberately unmapped minified traces", () => {
  const mapped = baseTrace([
    { kind: "handler", title: "a()", location: { originalLocation: { source: "src/minified-mapped.js" } } },
    { kind: "mutation", title: "Text changed to “Mapped action complete”" }
  ]);
  const unmapped = baseTrace([
    { kind: "handler", title: "a()", location: { url: "minified-no-map.js" } },
    { kind: "mutation", title: "Text changed to “Unmapped action complete”" }
  ]);
  assert.equal(CorpusEvaluator.evaluateTrace(mapped, "minified-map").passed, true);
  assert.equal(CorpusEvaluator.evaluateTrace(unmapped, "minified-no-map").passed, true);
});

test("rejects unknown scenario IDs", () => {
  assert.throws(() => CorpusEvaluator.evaluateTrace({}, "missing"), /Unknown scenario/);
});
