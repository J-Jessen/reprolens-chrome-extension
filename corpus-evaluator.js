(function exposeCorpusEvaluator(root) {
  const scenarios = {
    "react-timer": {
      label: "React delegated handler + timer",
      checks: [
        ["component", "React owner is CheckoutCard", (trace) => trace.framework?.owner === "CheckoutCard"],
        ["component-context", "React prop and state shape is captured", (trace) => trace.framework?.context?.valuesCaptured === false && trace.framework.context.state.length >= 2],
        ["component-privacy", "Raw React fiber values are absent", (trace) => !JSON.stringify(trace.framework || {}).includes("memoizedState")],
        ["handler", "Authored React handler is visible", (trace) => hasTitle(trace, "handleReactCheckout")],
        ["request", "React order request is captured", (trace) => hasTitle(trace, "order.json?reactTrace=1", "request")],
        ["timer", "Timer schedule and callback are captured", (trace) => events(trace, "async").length >= 2],
        ["lineage", "Timer callback points to its schedule", (trace) => events(trace, "async").some((event) => Boolean(event.parentId))],
        ["source-map", "Authored JSX location is resolved", (trace) => hasOriginalSource(trace, "src/main.jsx")]
      ]
    },
    "native-success": {
      label: "Native listener + successful fetch",
      checks: [
        ["handler", "submitOrder handler is captured", (trace) => hasTitle(trace, "submitOrder", "handler")],
        ["request", "Demo order request is captured", (trace) => hasTitle(trace, "order.json?traceDemo=1", "request")],
        ["response", "Successful response is captured", (trace) => events(trace, "response").some((event) => event.title.startsWith("200 "))],
        ["mutation", "Resulting DOM change is captured", (trace) => events(trace, "mutation").length > 0]
      ]
    },
    "fetch-failure": {
      label: "Handled fetch failure",
      checks: [
        ["handler", "runFailingFetch handler is captured", (trace) => hasTitle(trace, "runFailingFetch", "handler")],
        ["request", "Missing resource request is captured", (trace) => hasTitle(trace, "missing-order.json", "request")],
        ["response", "404 response is captured", (trace) => events(trace, "response").some((event) => event.title.startsWith("404 "))],
        ["error", "Expected console error is captured", (trace) => events(trace, "exception").some((event) => event.title.includes("Expected corpus failure"))],
        ["mutation", "Handled failure state is captured", (trace) => events(trace, "mutation").some((event) => event.title.includes("Handled expected failure"))]
      ]
    },
    navigation: {
      label: "History API navigation",
      checks: [
        ["handler", "Navigation handler is captured", (trace) => hasTitle(trace, "navigateToOrderDetails", "handler")],
        ["navigation", "Same-document navigation is captured", (trace) => events(trace, "navigation").some((event) => event.title.includes("view=order-details"))],
        ["mutation", "Route-driven DOM change is captured", (trace) => events(trace, "mutation").some((event) => event.title.includes("order details"))]
      ]
    },
    "minified-map": {
      label: "Minified bundle with source map",
      checks: [
        ["handler", "A minified handler boundary is captured", (trace) => events(trace, "handler").length > 0],
        ["source-map", "Authored minified source is resolved", (trace) => hasOriginalSource(trace, "src/minified-mapped.js")],
        ["mutation", "Mapped action DOM change is captured", (trace) => events(trace, "mutation").some((event) => event.title.includes("Mapped"))]
      ]
    },
    "minified-no-map": {
      label: "Minified bundle without source map",
      checks: [
        ["handler", "A deployed handler boundary is captured", (trace) => events(trace, "handler").length > 0],
        ["fallback", "No authored source is claimed", (trace) => !hasAnyOriginalSource(trace)],
        ["mutation", "Unmapped action DOM change is captured", (trace) => events(trace, "mutation").some((event) => event.title.includes("Unmapped"))]
      ]
    },
    "keyboard-interaction": interactionScenario("Keyboard interaction", "keydown", "Keyboard action complete"),
    "change-interaction": interactionScenario("Input change", "change", "Input change complete"),
    "submit-interaction": interactionScenario("Form submission", "submit", "Form submission complete"),
    "drop-interaction": interactionScenario("Drag and drop", "drop", "Drop action complete"),
    "cross-origin-iframe": {
      label: "Cross-origin iframe internals",
      checks: [
        ["context", "Cross-origin iframe context is attached", (trace) => (trace.executionContexts || []).some((context) => context.type === "iframe")],
        ["frame", "The attached frame appears in the timeline", (trace) => events(trace, "frame").length > 0],
        ["request", "A request made inside the frame is captured", (trace) => events(trace, "request").some((event) => event.contextType === "iframe" && event.url.includes("iframe-internal"))],
        ["warning", "A warning emitted inside the frame is captured", (trace) => events(trace, "exception").some((event) => event.contextType === "iframe" && event.title.includes("Expected iframe warning"))],
        ["privacy", "Frame body content is not captured", (trace) => !JSON.stringify(trace).includes("private iframe content")]
      ]
    },
    "dom-text": mutationScenario("Text content mutation", "Text mutation complete"),
    "dom-attribute": mutationScenario("Attribute mutation", "data-state"),
    "dom-add": mutationScenario("Node insertion", "node(s) added"),
    "dom-remove": mutationScenario("Node removal", "removed"),
    "timer-zero": timerScenario("Zero-delay timer", "Immediate timer complete"),
    "timer-delayed": timerScenario("Delayed timer", "Delayed timer complete"),
    "timer-interval": asyncScenario("Interval callback", "setInterval", "Interval tick 2"),
    "animation-frame": asyncScenario("Animation frame callback", "requestAnimationFrame", "Animation frame complete"),
    "promise-chain": asyncScenario("Promise continuation chain", "Promise", "Promise chain complete"),
    "queue-microtask": asyncScenario("Queued microtask", "queueMicrotask", "Microtask complete"),
    "worker-message": {
      label: "Worker lifecycle without message content",
      checks: [
        ["created", "Worker creation is captured", (trace) => hasTitle(trace, "Worker created", "worker")],
        ["context", "Worker execution context is attached when Chrome supports it", (trace) => (trace.executionContexts || []).some((context) => context.type === "worker")],
        ["internal-request", "A request made inside the Worker is captured", (trace) => events(trace, "request").some((event) => event.contextType === "worker" && event.url.includes("worker-internal"))],
        ["internal-warning", "A warning emitted inside the Worker is captured", (trace) => events(trace, "exception").some((event) => event.contextType === "worker" && event.title.includes("Expected worker warning"))],
        ["sent", "Worker outbound message is captured", (trace) => hasTitle(trace, "message sent", "worker")],
        ["received", "Worker inbound message is captured", (trace) => hasTitle(trace, "message received", "worker")],
        ["privacy", "Worker message contents are absent", (trace) => !JSON.stringify(trace.workerEvents || []).includes("private worker")],
        ["mutation", "Worker-driven DOM change is captured", (trace) => hasTitle(trace, "Worker result received", "mutation")]
      ]
    },
    "fetch-get": networkScenario("GET request", "GET ", "200 "),
    "fetch-post": networkScenario("POST request", "POST ", "200 "),
    "fetch-404": networkScenario("404 response without thrown error", "GET ", "404 "),
    "parallel-fetch": {
      label: "Parallel requests",
      checks: [
        ["requests", "Both parallel requests are captured", (trace) => events(trace, "request").length === 2],
        ["responses", "Both parallel responses are captured", (trace) => events(trace, "response").filter((event) => event.title.startsWith("200 ")).length === 2],
        ["mutation", "Parallel completion state is captured", (trace) => hasTitle(trace, "2 requests complete", "mutation")]
      ]
    },
    "websocket-message": {
      label: "WebSocket lifecycle without payload capture",
      checks: [
        ["connect", "WebSocket connection is captured", (trace) => hasTitle(trace, "WebSocket connect", "websocket")],
        ["open", "WebSocket handshake is captured", (trace) => hasTitle(trace, "WebSocket open", "websocket")],
        ["frame", "WebSocket frame direction is captured", (trace) => hasTitle(trace, "frame received", "websocket")],
        ["privacy", "WebSocket payload content is absent", (trace) => !JSON.stringify(trace.webSockets || []).includes("ready")],
        ["mutation", "Message-driven DOM change is captured", (trace) => hasTitle(trace, "WebSocket message received", "mutation")]
      ]
    },
    "console-warning": {
      label: "Console warning",
      checks: [
        ["warning", "Expected warning is captured", (trace) => hasTitle(trace, "Expected automated corpus warning", "exception")],
        ["mutation", "Post-warning DOM change is captured", (trace) => hasTitle(trace, "Warning logged", "mutation")]
      ]
    },
    "sync-error": {
      label: "Synchronous exception",
      checks: [
        ["exception", "Uncaught exception is captured", (trace) => events(trace, "exception").some((event) => event.title.includes("Uncaught") || event.title.includes("automated corpus exception"))],
        ["mutation", "Pre-exception DOM change is captured", (trace) => hasTitle(trace, "About to throw", "mutation")]
      ]
    },
    "hash-navigation": navigationScenario("Hash navigation", "#trace-complete"),
    "history-replace": navigationScenario("History state replacement", "view=complete")
  };

  function mutationScenario(label, expected) {
    return {
      label,
      checks: [
        ["handler", "Authored click handler is captured", (trace) => events(trace, "handler").length > 0],
        ["mutation", "Expected DOM mutation is captured", (trace) => hasTitle(trace, expected, "mutation")]
      ]
    };
  }

  function interactionScenario(label, eventType, expectedMutation) {
    return {
      label,
      checks: [
        ["type", `${eventType} is the captured interaction boundary`, (trace) => trace.interaction?.eventType === eventType],
        ["handler", "The interaction handler is captured", (trace) => events(trace, "handler").length > 0],
        ["mutation", "The interaction result is captured", (trace) => hasTitle(trace, expectedMutation, "mutation")],
        ["privacy", "Field and drop payload values are absent", (trace) => !JSON.stringify(trace).includes("privacy-safe test value")]
      ]
    };
  }

  function timerScenario(label, expectedMutation) {
    return {
      label,
      checks: [
        ["timer", "Timer schedule and callback are captured", (trace) => events(trace, "async").length >= 2],
        ["lineage", "Timer callback points to its schedule", (trace) => events(trace, "async").some((event) => Boolean(event.parentId))],
        ["mutation", "Timer-driven DOM change is captured", (trace) => hasTitle(trace, expectedMutation, "mutation")]
      ]
    };
  }

  function asyncScenario(label, expectedBoundary, expectedMutation) {
    return {
      label,
      checks: [
        ["schedule", `${expectedBoundary} schedule is captured`, (trace) => hasTitle(trace, `${expectedBoundary} scheduled`, "async")],
        ["callback", `${expectedBoundary} callback is captured`, (trace) => hasTitle(trace, `${expectedBoundary} callback`, "async")],
        ["lineage", "Callback points to its schedule", (trace) => events(trace, "async").some((event) => Boolean(event.parentId))],
        ["mutation", "Async DOM change is captured", (trace) => hasTitle(trace, expectedMutation, "mutation")]
      ]
    };
  }

  function networkScenario(label, requestPrefix, responsePrefix) {
    return {
      label,
      checks: [
        ["request", "Expected request is captured", (trace) => events(trace, "request").some((event) => event.title.startsWith(requestPrefix))],
        ["response", "Expected response is captured", (trace) => events(trace, "response").some((event) => event.title.startsWith(responsePrefix))],
        ["mutation", "Resulting DOM change is captured", (trace) => events(trace, "mutation").length > 0]
      ]
    };
  }

  function navigationScenario(label, urlFragment) {
    return {
      label,
      checks: [
        ["navigation", "Expected navigation is captured", (trace) => hasTitle(trace, urlFragment, "navigation")],
        ["mutation", "Navigation-related DOM change is captured", (trace) => events(trace, "mutation").length > 0]
      ]
    };
  }

  function events(trace, kind) {
    return (trace.timeline || []).filter((event) => !kind || event.kind === kind);
  }

  function hasTitle(trace, fragment, kind) {
    return events(trace, kind).some((event) => event.title?.includes(fragment));
  }

  function timelineFrames(trace) {
    return events(trace).flatMap((event) => [event.location, ...(event.frames || [])]).filter(Boolean);
  }

  function hasOriginalSource(trace, suffix) {
    return timelineFrames(trace).some((frame) => frame.originalLocation?.source?.endsWith(suffix));
  }

  function hasAnyOriginalSource(trace) {
    return timelineFrames(trace).some((frame) => Boolean(frame.originalLocation?.source));
  }

  function evaluateTrace(trace, scenarioId) {
    const scenario = scenarios[scenarioId];
    if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
    const definitions = [
      ["schema", "Trace uses schema version 2", (value) => value.schemaVersion === 2 && Boolean(value.traceId)],
      ["complete", "Trace completed", (value) => value.status === "complete"],
      ["interaction", "Interaction boundary is present", (value) => events(value, "interaction").length === 1],
      ["metadata", "Timeline events include relationship, capture, and privacy metadata", (value) => events(value).every((event) => Boolean(event.relationType && event.captureMethod && event.privacyClassification))],
      ...scenario.checks
    ];
    const checks = definitions.map(([id, label, predicate]) => {
      let passed = false;
      try {
        passed = Boolean(predicate(trace));
      } catch (_) {
        passed = false;
      }
      return { id, label, passed };
    });
    const passedCount = checks.filter((check) => check.passed).length;
    return {
      scenarioId,
      label: scenario.label,
      passed: passedCount === checks.length,
      score: Math.round((passedCount / checks.length) * 100),
      checks
    };
  }

  const api = { evaluateTrace, scenarios };
  root.CorpusEvaluator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

if (typeof require !== "undefined" && require.main === module) {
  const fs = require("node:fs");
  const [, , scenarioId, tracePath] = process.argv;
  if (!scenarioId || !tracePath) {
    console.error("Usage: node corpus-evaluator.js <scenario-id> <trace.json>");
    process.exitCode = 2;
  } else {
    try {
      const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
      const result = module.exports.evaluateTrace(trace, scenarioId);
      console.log(JSON.stringify(result, null, 2));
      if (!result.passed) process.exitCode = 1;
    } catch (error) {
      console.error(error.message || String(error));
      process.exitCode = 2;
    }
  }
}
