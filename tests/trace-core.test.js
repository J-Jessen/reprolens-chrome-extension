const assert = require("node:assert/strict");
const test = require("node:test");
const TraceCore = require("../trace-core.js");

test("filters extension frames and converts CDP locations to one-based values", () => {
  const frames = TraceCore.usefulFrames([
    { functionName: "internal", url: "chrome-extension://abc/content.js", location: { lineNumber: 1, columnNumber: 2 } },
    { functionName: "submitOrder", url: "http://localhost:4173/demo.js", location: { lineNumber: 7, columnNumber: 4 } }
  ]);
  assert.deepEqual(frames, [{
    functionName: "submitOrder",
    url: "http://localhost:4173/demo.js",
    scriptId: "",
    lineNumber: 8,
    columnNumber: 5,
    originalLocation: null
  }]);
});

test("filters internal content-script handlers even when Chrome omits their URL", () => {
  const frames = TraceCore.usefulFrames([
    { functionName: "__behaviourTracerOnInteraction", url: "", location: { scriptId: "33", lineNumber: 188, columnNumber: 4 } },
    { functionName: "submitOrder", url: "", location: { scriptId: "39", lineNumber: 4, columnNumber: 2 } }
  ]);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].functionName, "submitOrder");
  assert.equal(frames[0].scriptId, "39");
});

test("parses Chrome Error stacks into zero-based frames for source-map resolution", () => {
  const frames = TraceCore.parseBrowserStack([
    "Error",
    "    at __behaviourTracerSetTimeout (<anonymous>:1:1)",
    "    at handleReactCheckout (http://127.0.0.1:4175/app.js:21465:30)"
  ].join("\n"));
  assert.deepEqual(frames, [{
    functionName: "handleReactCheckout",
    url: "http://127.0.0.1:4175/app.js",
    lineNumber: 21464,
    columnNumber: 29
  }]);
});

test("builds an ordered timeline with explicit confidence", () => {
  const session = {
    pageUrl: "http://localhost:4173/cart",
    startedAt: 1000,
    interactionAt: 1100,
    interaction: { eventType: "click", element: { selector: "#checkout", text: "Complete order" } },
    handlers: [{ at: 1110, eventName: "click", callFrames: [{ functionName: "submitOrder", url: "", location: { scriptId: "39", lineNumber: 5, columnNumber: 0 } }] }],
    network: [
      { phase: "request", at: 1170, requestId: "1", method: "GET", url: "http://localhost:4173/order.json", type: "Fetch", initiatorCallFrames: [{ functionName: "submitOrder", url: "http://localhost:4173/demo.js", scriptId: "39", lineNumber: 8, columnNumber: 2 }] },
      { phase: "response", at: 1200, requestId: "1", status: 200, url: "http://localhost:4173/order.json", type: "Fetch" }
    ],
    mutations: [{ at: 1250, summary: "Text content changed", target: "#result" }],
    exceptions: [],
    logs: [],
    navigations: []
  };
  const timeline = TraceCore.buildTimeline(session);
  assert.deepEqual(timeline.map((event) => event.kind), ["interaction", "handler", "request", "response", "mutation"]);
  assert.equal(timeline[1].location.lineNumber, 6);
  assert.equal(timeline[2].confidenceLabel, "direct");
  assert.equal(timeline[2].location.lineNumber, 9);
  assert.equal(timeline[2].networkScope, "same-origin");
  assert.equal(timeline[1].parentId, timeline[0].id);
  assert.equal(timeline[2].parentId, timeline[1].id);
  assert.match(timeline[2].detail, /^same-origin/);
  assert.equal(timeline[3].confidence, 0.92);
  assert.equal(timeline[3].parentId, timeline[2].id);
  assert.equal(timeline[3].durationMs, 30);
  assert.match(timeline[3].detail, /30ms/);
  assert.equal(timeline[0].confidence, 1);
  assert.deepEqual(timeline.slice(0, 4).map((event) => event.primaryChain), [true, true, true, true]);
  assert.equal(timeline[4].primaryChain, false);
});

test("distinguishes same-origin and cross-origin network traffic", () => {
  assert.equal(TraceCore.networkScope("/api/order", "https://shop.example/cart"), "same-origin");
  assert.equal(TraceCore.networkScope("https://analytics.example/event", "https://shop.example/cart"), "cross-origin");
  assert.equal(TraceCore.networkScope("not a url", "not a page url"), "unknown-origin");
});

test("filters timeline categories while retaining the interaction anchor", () => {
  const timeline = [
    { id: "interaction", kind: "interaction" },
    { id: "handler", kind: "handler" },
    { id: "request", kind: "request" },
    { id: "response", kind: "response" },
    { id: "mutation", kind: "mutation" },
    { id: "exception", kind: "exception" }
  ];

  assert.deepEqual(TraceCore.filterTimeline(timeline, "network").map((event) => event.id), [
    "interaction", "request", "response"
  ]);
  assert.deepEqual(TraceCore.filterTimeline(timeline, "dom").map((event) => event.id), [
    "interaction", "mutation"
  ]);
  assert.deepEqual(TraceCore.filterTimeline(timeline, "errors").map((event) => event.id), [
    "interaction", "exception"
  ]);
  assert.deepEqual(TraceCore.filterTimeline([
    { id: "interaction", kind: "interaction" },
    { id: "app", kind: "request", networkScope: "same-origin" },
    { id: "external", kind: "request", networkScope: "cross-origin" }
  ], "same-origin").map((event) => event.id), ["interaction", "app"]);
  assert.deepEqual(TraceCore.filterTimeline([
    { id: "interaction", kind: "interaction", primaryChain: true },
    { id: "handler", kind: "handler", primaryChain: true },
    { id: "mutation", kind: "mutation", primaryChain: false }
  ], "primary").map((event) => event.id), ["interaction", "handler"]);
});

test("marks only explicitly related evidence as the primary chain", () => {
  const timeline = TraceCore.markPrimaryChain([
    { id: "interaction", kind: "interaction", relationType: "root", relationshipEvidence: "root", confidence: 1 },
    { id: "handler", kind: "handler", parentId: "interaction", relationshipEvidence: "explicit", confidence: 1 },
    { id: "request", kind: "request", parentId: "handler", relationshipEvidence: "explicit", confidence: 0.98 },
    { id: "correlated", kind: "mutation", parentId: "handler", relationshipEvidence: "correlated", confidence: 0.9 },
    { id: "unrelated", kind: "mutation", relationshipEvidence: "none", confidence: 1 }
  ]);
  assert.deepEqual(timeline.filter((event) => event.primaryChain).map((event) => event.id), [
    "interaction", "handler", "request"
  ]);
});

test("bounds local trace history by both count and serialized size", () => {
  const traces = [
    { id: "newest", payload: "x".repeat(30) },
    { id: "middle", payload: "x".repeat(30) },
    { id: "oldest", payload: "x".repeat(30) }
  ];
  assert.deepEqual(TraceCore.limitHistory(traces, 2, 10_000).traces.map((trace) => trace.id), ["newest", "middle"]);
  const oneTraceBudget = TraceCore.serializedBytes([traces[0]]);
  const bounded = TraceCore.limitHistory(traces, 25, oneTraceBudget);
  assert.deepEqual(bounded.traces.map((trace) => trace.id), ["newest"]);
  assert.ok(bounded.bytes <= oneTraceBudget);
});

test("redacts sensitive values from exported traces", () => {
  const exported = TraceCore.redactForExport({
    pageUrl: "https://shop.example/order?token=top-secret&mode=test",
    selectedElement: {
      text: "Contact dev@example.com",
      html: '<input value="private" data-token="hidden">'
    },
    network: [{ url: "https://api.example/run?apiKey=123&safe=yes", authorization: "Bearer abc" }],
    timeline: [],
    handlers: [],
    asyncEvents: []
  });

  const json = JSON.stringify(exported.trace);
  assert.doesNotMatch(json, /top-secret|dev@example\.com|private|hidden|Bearer abc|apiKey=123/);
  assert.match(json, /mode=test/);
  assert.match(json, /safe=yes/);
  assert.equal(exported.totalRedactions, 6);
  assert.equal(exported.report.sensitiveFields, 1);
});

test("redacts common provider secrets and named credentials embedded in text", () => {
  const exported = TraceCore.redactForExport({
    schemaVersion: 2,
    status: "complete",
    logs: [{
      text: [
        "api_key=plain-secret",
        "AKIAIOSFODNN7EXAMPLE",
        "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
        "sk_live_abcdefghijklmnopqrstuvwxyz123456",
        "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
        "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----"
      ].join(" ")
    }],
    timeline: []
  });
  const json = JSON.stringify(exported.trace);
  assert.doesNotMatch(json, /plain-secret|AKIAIOSFODNN7EXAMPLE|ghp_|sk_live_|sk-proj-|private-material/);
  assert.equal(exported.report.credentials, 6);
});

test("validates imported trace schema", () => {
  assert.deepEqual(TraceCore.validateImportedTrace({ schemaVersion: 1, status: "complete", timeline: [] }), { ok: true, error: null });
  assert.deepEqual(TraceCore.validateImportedTrace({ schemaVersion: 2, status: "complete", timeline: [] }), { ok: true, error: null });
  assert.match(TraceCore.validateImportedTrace({ schemaVersion: 3, status: "complete", timeline: [] }).error, /Unsupported schema/);
  assert.match(TraceCore.validateImportedTrace({ schemaVersion: 1, status: "recording", timeline: [] }).error, /completed/);
  assert.match(TraceCore.validateImportedTrace({ schemaVersion: 1, status: "complete", timeline: [{}] }).error, /timeline/);
});

test("migrates schema version 1 traces to relation-aware version 2", () => {
  const migrated = TraceCore.migrateTrace({
    schemaVersion: 1,
    status: "complete",
    startedAt: 123,
    tabId: 7,
    timeline: [
      { id: "interaction", kind: "interaction", atMs: 0 },
      { id: "response", kind: "response", atMs: 5, parentId: "request" }
    ]
  });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.traceId, "legacy-123-7");
  assert.equal(migrated.timeline[0].relationType, "root");
  assert.equal(migrated.timeline[1].relationType, "response-to");
  assert.equal(migrated.timeline[1].captureMethod, "chrome-devtools-protocol");
  assert.equal(migrated.timeline[1].privacyClassification, "url-metadata");
});

test("builds a redacted Markdown trace report", () => {
  const report = TraceCore.markdownReport({
    schemaVersion: 1,
    status: "complete",
    pageUrl: "https://shop.example/?token=secret",
    selectedElement: { text: "Buy" },
    summary: "One request.",
    quality: { score: 100, label: "strong" },
    timeline: [{ atMs: 5, kind: "request", title: "GET /order", detail: "same-origin" }],
    handlers: [], network: [], asyncEvents: []
  });
  assert.match(report, /^# Behaviour trace/);
  assert.match(report, /Quality: 100% \(strong\)/);
  assert.match(report, /\+5ms · request/);
  assert.doesNotMatch(report, /token=secret/);
});

test("summary states captured evidence without overclaiming causality", () => {
  const session = {
    startedAt: 1000,
    interactionAt: 1000,
    interaction: { eventType: "click", element: { selector: "button", text: "Buy" } },
    handlers: [],
    network: [{ phase: "request", at: 1200, requestId: "1", method: "POST", url: "/buy" }],
    mutations: [],
    exceptions: [],
    logs: [],
    navigations: []
  };
  const summary = TraceCore.summarize(session);
  assert.match(summary, /observed/);
  assert.match(summary, /No page JavaScript handler frame was captured/);
});

test("summary includes captured same-document navigation", () => {
  const session = {
    startedAt: 1000,
    interactionAt: 1000,
    interaction: { eventType: "click", element: { selector: "#navigate", text: "Open order details" } },
    handlers: [],
    network: [],
    mutations: [],
    exceptions: [],
    logs: [],
    navigations: [{ at: 1005, url: "http://localhost/navigation.html?view=order-details", name: "historyApi" }]
  };
  assert.match(TraceCore.summarize(session), /1 navigation event was observed/);
});

test("scores trace coverage and explains missing evidence", () => {
  const quality = TraceCore.assessQuality({
    interaction: { eventType: "click", element: { selector: "#buy" } },
    timeline: [
      { kind: "interaction", confidence: 1 },
      { kind: "request", confidence: 0.88 }
    ],
    sourceMaps: { attempted: 1, mappedFrames: 0, errors: [] }
  });

  assert.equal(quality.score, 50);
  assert.equal(quality.label, "partial");
  assert.deepEqual(quality.diagnostics, [
    "JavaScript handler captured",
    "Network responses completed",
    "Authored source mapped"
  ]);
});

test("reports strong coverage for a complete trace", () => {
  const quality = TraceCore.assessQuality({
    interaction: { eventType: "click", element: { selector: "#buy" } },
    timeline: [
      { kind: "interaction", confidence: 1 },
      { kind: "handler", confidence: 1 },
      { kind: "request", confidence: 0.98 },
      { kind: "response", confidence: 0.92 }
    ],
    sourceMaps: { attempted: 1, mappedFrames: 2, errors: [] }
  });

  assert.equal(quality.score, 100);
  assert.equal(quality.label, "strong");
  assert.equal(quality.highConfidenceEvents, 3);
  assert.deepEqual(quality.diagnostics, []);
});

test("drops network noise observed before the marked interaction", () => {
  const timeline = TraceCore.buildTimeline({
    startedAt: 1000,
    interactionAt: 1500,
    interaction: { eventType: "click", element: { selector: "button" } },
    handlers: [],
    network: [
      { phase: "request", at: 1200, requestId: "old", method: "GET", url: "/background" },
      { phase: "request", at: 1550, requestId: "new", method: "POST", url: "/action" }
    ],
    mutations: [],
    exceptions: [],
    logs: [],
    navigations: []
  });
  assert.equal(timeline.some((event) => event.title.includes("background")), false);
  assert.equal(timeline.some((event) => event.title.includes("/action")), true);
});

test("collapses React dispatcher noise and surfaces the authored request initiator", () => {
  const dispatcher = { functionName: "dispatchDiscreteEvent", url: "", location: { scriptId: "73", lineNumber: 18022, columnNumber: 31 } };
  const noop = { functionName: "noop$1", url: "", location: { scriptId: "73", lineNumber: 3820, columnNumber: 8 } };
  const session = {
    startedAt: 1000,
    interactionAt: 1100,
    interaction: { eventType: "click", element: { selector: "#react-checkout", text: "Complete React order" } },
    handlers: [
      { at: 1103, callFrames: [dispatcher] },
      { at: 1104, callFrames: [noop] },
      { at: 1105, callFrames: [dispatcher] }
    ],
    network: [{
      phase: "request",
      at: 1109,
      requestId: "react-1",
      method: "GET",
      url: "/order.json",
      type: "Fetch",
      initiatorCallFrames: [
        { functionName: "handleReactCheckout", scriptId: "73", url: "/app.js", lineNumber: 21464, columnNumber: 29 },
        { functionName: "executeDispatch", scriptId: "73", url: "/app.js", lineNumber: 14883, columnNumber: 12 },
        { functionName: "a", scriptId: "73", url: "/app.js", lineNumber: 1, columnNumber: 1 },
        { functionName: "b", scriptId: "73", url: "/app.js", lineNumber: 2, columnNumber: 1 },
        { functionName: "c", scriptId: "73", url: "/app.js", lineNumber: 3, columnNumber: 1 },
        { functionName: "d", scriptId: "73", url: "/app.js", lineNumber: 4, columnNumber: 1 },
        { functionName: "e", scriptId: "73", url: "/app.js", lineNumber: 5, columnNumber: 1 },
        { functionName: "dispatchDiscreteEvent", scriptId: "73", url: "/app.js", lineNumber: 18026, columnNumber: 63 }
      ]
    }],
    mutations: [
      { at: 1110, summary: "Text changed to “Requesting…”", target: "#react-status" },
      { at: 1110, summary: "Attribute “class” changed", target: "#react-status" }
    ],
    exceptions: [],
    logs: [],
    navigations: []
  };
  const timeline = TraceCore.buildTimeline(session);
  assert.deepEqual(timeline.filter((event) => event.kind === "handler").map((event) => event.title), [
    "dispatchDiscreteEvent()",
    "handleReactCheckout()"
  ]);
  assert.equal(timeline.find((event) => event.kind === "request").confidence, 0.98);
  assert.equal(timeline.filter((event) => event.kind === "mutation").length, 1);
  assert.match(TraceCore.summarize(session), /authored request initiator was handleReactCheckout/);
});

test("shows a fallback timer chain and strengthens its adjacent DOM mutation", () => {
  const authoredFrame = {
    functionName: "handleReactCheckout",
    url: "http://localhost/app.js",
    location: { scriptId: "73", lineNumber: 21464, columnNumber: 29 }
  };
  const callbackFrame = {
    functionName: "applyConfirmedOrder",
    url: "http://localhost/app.js",
    location: { scriptId: "73", lineNumber: 21470, columnNumber: 4 }
  };
  const session = {
    startedAt: 1000,
    interactionAt: 1100,
    interaction: { eventType: "click", element: { selector: "#react-checkout", text: "Complete React order" } },
    handlers: [],
    timerCapture: { mode: "main-world-hook" },
    asyncEvents: [
      { at: 1140, eventName: "hook:setTimeout", timerId: 9, captureMode: "main-world-hook", callFrames: [authoredFrame] },
      {
        at: 1420,
        eventName: "hook:setTimeout.callback",
        timerId: 9,
        captureMode: "main-world-hook",
        callFrames: [callbackFrame],
        asyncStackTrace: { callFrames: [authoredFrame] }
      }
    ],
    network: [],
    mutations: [{ at: 1421, summary: "Text changed to confirmed", target: "#react-status" }],
    exceptions: [],
    logs: [],
    navigations: []
  };

  const timeline = TraceCore.buildTimeline(session);
  const timerEvents = timeline.filter((event) => event.kind === "async");
  const mutation = timeline.find((event) => event.kind === "mutation");
  assert.deepEqual(timerEvents.map((event) => event.title), [
    "setTimeout scheduled · handleReactCheckout()",
    "setTimeout callback · applyConfirmedOrder()"
  ]);
  assert.equal(timerEvents[1].parentId, timerEvents[0].id);
  assert.equal(timerEvents[1].confidence, 0.95);
  assert.match(timerEvents[1].detail, /scheduled by handleReactCheckout/);
  assert.equal(timerEvents[1].frames[1].functionName, "handleReactCheckout");
  assert.equal(mutation.confidence, 0.9);
  assert.equal(mutation.parentId, timerEvents[1].id);
  assert.equal(mutation.relationshipEvidence, "correlated");
  assert.equal(mutation.primaryChain, false);
  assert.match(mutation.detail, /immediately after async callback/);
  assert.match(TraceCore.summarize(session), /2 async boundary events were captured with the local MAIN-world fallback/);
});

test("drops internal extension timer frames with omitted URLs", () => {
  const frames = TraceCore.asyncEventFrames({
    callFrames: [{
      functionName: "__behaviourTracerFinishCapture",
      url: "",
      location: { scriptId: "33", lineNumber: 220, columnNumber: 4 }
    }]
  });
  assert.deepEqual(frames, []);
});

test("sanitizes public sessions without leaking CDP runtime objects", () => {
  const sensitiveFrame = {
    callFrameId: "temporary-call-frame",
    functionName: "submitOrder",
    url: "http://localhost/app.js",
    location: { scriptId: "73", lineNumber: 8, columnNumber: 2 },
    scopeChain: [{ object: { objectId: "sensitive-scope-id", description: "Object" } }],
    this: { objectId: "sensitive-this-id", className: "Window" },
    returnValue: { value: "sensitive-return-value" },
    originalLocation: {
      source: "src/main.jsx",
      url: "http://localhost/src/main.jsx",
      lineNumber: 13,
      columnNumber: 5,
      name: "submitOrder"
    }
  };
  const session = {
    scripts: { "73": { url: "http://localhost/app.js", sourceMapURL: "app.js.map" } },
    handlers: [{ at: 1000, callFrames: [sensitiveFrame] }],
    network: [{
      phase: "request",
      initiatorCallFrames: [sensitiveFrame],
      initiatorAsyncStack: { description: "Promise.then", callFrames: [sensitiveFrame] }
    }],
    asyncEvents: [{
      callFrames: [sensitiveFrame],
      asyncStackTrace: { description: "setTimeout", callFrames: [sensitiveFrame] }
    }],
    timeline: [{ kind: "handler", location: sensitiveFrame, frames: [sensitiveFrame] }]
  };

  const sanitized = TraceCore.sanitizePublicSession(session);
  const json = JSON.stringify(sanitized);
  assert.equal("scripts" in sanitized, false);
  assert.doesNotMatch(json, /callFrameId|scopeChain|objectId|returnValue|sensitive-/);
  assert.equal(sanitized.handlers[0].callFrames[0].location.scriptId, "73");
  assert.equal(sanitized.handlers[0].callFrames[0].originalLocation.source, "src/main.jsx");
  assert.equal(sanitized.network[0].initiatorAsyncStack.callFrames[0].location.scriptId, "73");
  assert.equal(session.handlers[0].callFrames[0].scopeChain[0].object.objectId, "sensitive-scope-id");
});
