(function exposeTraceCore(root) {
  const INTERNAL_SCHEMES = [
    "chrome-extension://",
    "extensions::",
    "node:internal"
  ];
  const INTERNAL_FUNCTION_PREFIX = "__behaviourTracer";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function confidenceLabel(score) {
    if (score >= 0.95) return "direct";
    if (score >= 0.7) return "strong";
    if (score >= 0.4) return "correlated";
    return "possible";
  }

  function normalizeConfidence(score) {
    return Math.round(clamp(score, 0, 1) * 100) / 100;
  }

  function confidenceFor(kind, deltaMs) {
    if (kind === "interaction" || kind === "handler") return 1;
    if (kind === "exception") return deltaMs <= 1000 ? 0.9 : 0.7;
    if (kind === "request") {
      if (deltaMs <= 100) return 0.88;
      if (deltaMs <= 500) return 0.72;
      if (deltaMs <= 2000) return 0.48;
      return 0.25;
    }
    if (kind === "response") return 0.78;
    if (kind === "mutation") return deltaMs <= 500 ? 0.82 : 0.58;
    if (kind === "navigation") return 0.8;
    return 0.5;
  }

  function normalizeFrame(frame) {
    const location = frame.location || {};
    const rawLine = Number.isFinite(location.lineNumber) ? location.lineNumber : frame.lineNumber;
    const rawColumn = Number.isFinite(location.columnNumber) ? location.columnNumber : frame.columnNumber;
    return {
      functionName: frame.functionName || "(anonymous)",
      url: frame.url || "",
      scriptId: location.scriptId || frame.scriptId || "",
      lineNumber: Number.isFinite(rawLine) ? rawLine + 1 : null,
      columnNumber: Number.isFinite(rawColumn) ? rawColumn + 1 : null,
      originalLocation: frame.originalLocation || null
    };
  }

  function compactOriginalLocation(location) {
    if (!location) return null;
    return {
      source: location.source || "",
      url: location.url || "",
      lineNumber: Number.isFinite(location.lineNumber) ? location.lineNumber : null,
      columnNumber: Number.isFinite(location.columnNumber) ? location.columnNumber : null,
      name: location.name || ""
    };
  }

  function compactFrame(frame) {
    if (!frame) return null;
    const compact = {
      functionName: frame.functionName || "(anonymous)",
      url: frame.url || ""
    };
    if (frame.location) {
      compact.location = {
        scriptId: frame.location.scriptId || "",
        lineNumber: Number.isFinite(frame.location.lineNumber) ? frame.location.lineNumber : null,
        columnNumber: Number.isFinite(frame.location.columnNumber) ? frame.location.columnNumber : null
      };
    } else {
      compact.scriptId = frame.scriptId || "";
      compact.lineNumber = Number.isFinite(frame.lineNumber) ? frame.lineNumber : null;
      compact.columnNumber = Number.isFinite(frame.columnNumber) ? frame.columnNumber : null;
    }
    if (frame.originalLocation) compact.originalLocation = compactOriginalLocation(frame.originalLocation);
    return compact;
  }

  function compactAsyncStack(stack) {
    if (!stack) return null;
    const compact = {
      description: stack.description || "",
      callFrames: (stack.callFrames || []).map(compactFrame).filter(Boolean)
    };
    if (stack.parent) compact.parent = compactAsyncStack(stack.parent);
    return compact;
  }

  function sanitizePublicSession(session) {
    const copy = JSON.parse(JSON.stringify(session));
    delete copy.scripts;
    copy.handlers = (copy.handlers || []).map((handler) => ({
      ...handler,
      callFrames: (handler.callFrames || []).map(compactFrame).filter(Boolean)
    }));
    copy.network = (copy.network || []).map((item) => ({
      ...item,
      initiatorCallFrames: (item.initiatorCallFrames || []).map(compactFrame).filter(Boolean)
    }));
    copy.asyncEvents = (copy.asyncEvents || []).map((event) => ({
      ...event,
      callFrames: (event.callFrames || []).map(compactFrame).filter(Boolean),
      asyncStackTrace: compactAsyncStack(event.asyncStackTrace)
    }));
    copy.timeline = (copy.timeline || []).map((event) => ({
      ...event,
      ...(event.location ? { location: compactFrame(event.location) } : {}),
      ...(event.frames ? { frames: event.frames.map(compactFrame).filter(Boolean) } : {})
    }));
    return copy;
  }

  function locationLabel(frame) {
    const location = frame?.originalLocation;
    if (location?.source && location.lineNumber) {
      const shortSource = location.source.split("/").slice(-2).join("/");
      return `${shortSource}:${location.lineNumber}`;
    }
    if (frame?.url && frame.lineNumber) {
      const shortUrl = frame.url.split("/").pop();
      return `${shortUrl}:${frame.lineNumber}`;
    }
    return "";
  }

  function usefulFrames(callFrames, limit) {
    return (callFrames || [])
      .map(normalizeFrame)
      .filter((frame) => !INTERNAL_SCHEMES.some((prefix) => frame.url.startsWith(prefix)))
      .filter((frame) => !frame.functionName.startsWith(INTERNAL_FUNCTION_PREFIX))
      .slice(0, limit || 5);
  }

  function parseBrowserStack(stack) {
    return String(stack || "").split("\n").flatMap((line) => {
      const match = line.match(/^\s*at\s+(?:(.*?)\s+\()?((?:https?|file):\/\/.+?):(\d+):(\d+)\)?$/);
      if (!match) return [];
      return [{
        functionName: match[1] || "(anonymous)",
        url: match[2],
        lineNumber: Number(match[3]) - 1,
        columnNumber: Number(match[4]) - 1
      }];
    });
  }

  function flattenAsyncStack(stack) {
    const frames = [];
    let current = stack;
    while (current) {
      frames.push(...(current.callFrames || []));
      current = current.parent;
    }
    return frames;
  }

  function asyncEventFrames(event, limit) {
    const frames = usefulFrames([
      ...(event?.callFrames || []),
      ...flattenAsyncStack(event?.asyncStackTrace)
    ], limit || 8);
    const seen = new Set();
    return frames.filter((frame) => {
      const key = `${frameKey(frame)}:${frame.lineNumber}:${frame.columnNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function frameKey(frame) {
    const source = frame.scriptId ? `script:${frame.scriptId}` : `url:${frame.url}`;
    return `${source}:${frame.functionName}`;
  }

  function isNoiseHandler(frame) {
    return /^(?:noop|noop\$\d+)$/i.test(frame.functionName);
  }

  function relativeMs(at, interactionAt, fallbackAt) {
    const origin = interactionAt || fallbackAt || at;
    return Math.max(0, Math.round(at - origin));
  }

  function buildTimeline(session) {
    const origin = session.interactionAt || session.startedAt;
    const events = [];
    const afterInteraction = (item) => !session.interactionAt || item.at >= session.interactionAt;
    const aroundInteraction = (item) => !session.interactionAt || item.at >= session.interactionAt - 100;
    const handlerFrameKeys = new Set(
      (session.handlers || [])
        .filter(aroundInteraction)
        .flatMap((handler) => usefulFrames(handler.callFrames, 5))
        .map(frameKey)
    );

    function requestEvidence(item) {
      const allInitiatorFrames = usefulFrames(item.initiatorCallFrames, 50);
      const matchesHandler = allInitiatorFrames.some((frame) => handlerFrameKeys.has(frameKey(frame)));
      return {
        allInitiatorFrames,
        displayFrames: allInitiatorFrames.slice(0, 5),
        matchesHandler
      };
    }

    function requestConfidence(item) {
      const evidence = requestEvidence(item);
      const initiatorFrames = evidence.allInitiatorFrames;
      const matchesHandler = evidence.matchesHandler;
      if (matchesHandler) return 0.98;
      if (initiatorFrames.length) return 0.88;
      return confidenceFor("request", relativeMs(item.at, origin, session.startedAt));
    }

    if (session.interaction) {
      const component = session.framework?.owner
        ? `${session.framework.library || "Framework"} · ${session.framework.owner}`
        : "";
      events.push({
        id: "interaction",
        kind: "interaction",
        atMs: 0,
        title: `${session.interaction.eventType || "click"} ${session.interaction.element?.selector || "element"}`,
        detail: [session.interaction.element?.text || session.interaction.element?.tagName || "", component].filter(Boolean).join(" · "),
        confidence: 1,
        confidenceLabel: "direct"
      });
    }

    const displayedHandlerKeys = new Set();
    (session.handlers || []).filter(aroundInteraction).forEach((handler, index) => {
      const frames = usefulFrames(handler.callFrames, 5);
      const top = frames[0];
      if (!top || isNoiseHandler(top)) return;
      const key = frameKey(top);
      if (displayedHandlerKeys.has(key)) return;
      displayedHandlerKeys.add(key);
      events.push({
        id: `handler-${index}`,
        kind: "handler",
        atMs: relativeMs(handler.at, origin, session.startedAt),
        title: top ? `${top.functionName}()` : "JavaScript event listener",
        detail: locationLabel(top) || handler.eventName || "click listener",
        location: top || null,
        frames,
        confidence: 1,
        confidenceLabel: "direct"
      });
    });

    const requestById = new Map();
    (session.network || []).filter(afterInteraction).forEach((item) => {
      if (item.phase === "request") requestById.set(item.requestId, item);
    });

    (session.network || []).filter(afterInteraction).forEach((item, index) => {
      const delta = relativeMs(item.at, origin, session.startedAt);
      const kind = item.phase === "response" ? "response" : "request";
      const request = item.phase === "response" ? requestById.get(item.requestId) : item;
      const evidence = request ? requestEvidence(request) : { allInitiatorFrames: [], displayFrames: [], matchesHandler: false };
      const initiatorFrames = evidence.displayFrames;
      const score = item.phase === "response"
        ? Math.min(0.92, request ? requestConfidence(request) - 0.06 : confidenceFor(kind, delta))
        : requestConfidence(item);

      if (item.phase === "request") {
        const authoredFrame = evidence.allInitiatorFrames[0];
        const authoredKey = authoredFrame ? frameKey(authoredFrame) : "";
        if (evidence.matchesHandler && authoredFrame && authoredFrame.functionName !== "(anonymous)" && !displayedHandlerKeys.has(authoredKey)) {
          displayedHandlerKeys.add(authoredKey);
          events.push({
            id: `initiator-handler-${index}`,
            kind: "handler",
            origin: "request-initiator",
            atMs: Math.max(0, delta - 1),
            title: `${authoredFrame.functionName}()`,
            detail: `authored request initiator${locationLabel(authoredFrame) ? ` · ${locationLabel(authoredFrame)}` : ""}`,
            location: authoredFrame,
            frames: initiatorFrames,
            confidence: 0.95,
            confidenceLabel: "direct"
          });
        }
      }

      events.push({
        id: `network-${index}`,
        kind,
        atMs: delta,
        title: item.phase === "response"
          ? `${item.status || ""} ${request?.url || item.url || "response"}`.trim()
          : `${item.method || "GET"} ${item.url}`,
        detail: `${item.type || "Network"}${initiatorFrames[0] ? ` · from ${initiatorFrames[0].functionName}()` : ""}${locationLabel(initiatorFrames[0]) ? ` · ${locationLabel(initiatorFrames[0])}` : ""}`,
        location: initiatorFrames[0] || null,
        frames: initiatorFrames,
        confidence: normalizeConfidence(score),
        confidenceLabel: confidenceLabel(score)
      });
    });

    const relevantAsyncEvents = (session.asyncEvents || []).filter(afterInteraction).sort((a, b) => a.at - b.at);
    const timerSchedulesByFrame = new Map();
    const timerSchedulesById = new Map();
    relevantAsyncEvents.forEach((event, index) => {
      const frames = asyncEventFrames(event, 8);
      const top = frames[0];
      if (!top) return;
      const isCallback = event.eventName?.endsWith(".callback");
      const action = isCallback ? "setTimeout callback" : "setTimeout scheduled";
      const id = `async-${index}`;
      const asyncParent = isCallback
        ? usefulFrames(flattenAsyncStack(event.asyncStackTrace), 8)[0]
        : null;
      const parentId = (event.timerId != null ? timerSchedulesById.get(event.timerId) : null)
        || (asyncParent ? timerSchedulesByFrame.get(frameKey(asyncParent)) : null)
        || null;
      const captureLabel = event.captureMode === "main-world-hook"
        ? "local MAIN-world timer hook"
        : "browser timer instrumentation";
      const score = event.captureMode === "main-world-hook" ? 0.95 : 1;
      const detail = [
        locationLabel(top) || captureLabel,
        asyncParent
          ? `scheduled by ${asyncParent.functionName}()${locationLabel(asyncParent) ? ` at ${locationLabel(asyncParent)}` : ""}`
          : ""
      ].filter(Boolean).join(" · ");
      events.push({
        id,
        kind: "async",
        atMs: relativeMs(event.at, origin, session.startedAt),
        title: `${action} · ${top.functionName}()`,
        detail,
        parentId,
        location: top,
        frames,
        confidence: score,
        confidenceLabel: confidenceLabel(score)
      });
      if (!isCallback) {
        timerSchedulesByFrame.set(frameKey(top), id);
        if (event.timerId != null) timerSchedulesById.set(event.timerId, id);
      }
    });

    const timerCallbacks = relevantAsyncEvents.filter((event) => event.eventName?.endsWith(".callback"));

    const relevantMutations = (session.mutations || []).filter(afterInteraction);
    relevantMutations.filter((mutation) => {
      if (mutation.summary !== "Attribute “class” changed") return true;
      return !relevantMutations.some((other) => other !== mutation
        && other.target === mutation.target
        && Math.abs(other.at - mutation.at) <= 1
        && !other.summary.startsWith("Attribute “"));
    }).forEach((mutation, index) => {
      const delta = relativeMs(mutation.at, origin, session.startedAt);
      const followsTimerCallback = timerCallbacks.some((event) => Math.abs(event.at - mutation.at) <= 20);
      const score = followsTimerCallback ? 0.9 : confidenceFor("mutation", delta);
      events.push({
        id: `mutation-${index}`,
        kind: "mutation",
        atMs: delta,
        title: mutation.summary,
        detail: `${mutation.target || "DOM"}${followsTimerCallback ? " · immediately after setTimeout callback" : ""}`,
        confidence: score,
        confidenceLabel: confidenceLabel(score)
      });
    });

    (session.exceptions || []).filter(afterInteraction).forEach((exception, index) => {
      const delta = relativeMs(exception.at, origin, session.startedAt);
      const score = confidenceFor("exception", delta);
      events.push({
        id: `exception-${index}`,
        kind: "exception",
        atMs: delta,
        title: exception.text || "JavaScript exception",
        detail: exception.url || "",
        confidence: score,
        confidenceLabel: confidenceLabel(score)
      });
    });

    (session.logs || []).filter(afterInteraction).forEach((entry, index) => {
      const delta = relativeMs(entry.at, origin, session.startedAt);
      const score = confidenceFor("exception", delta);
      events.push({
        id: `console-${index}`,
        kind: "exception",
        atMs: delta,
        title: `${entry.level || "console"}: ${entry.text || "Console message"}`,
        detail: entry.url || "",
        confidence: score,
        confidenceLabel: confidenceLabel(score)
      });
    });

    (session.navigations || []).filter(afterInteraction).forEach((navigation, index) => {
      const delta = relativeMs(navigation.at, origin, session.startedAt);
      const score = confidenceFor("navigation", delta);
      events.push({
        id: `navigation-${index}`,
        kind: "navigation",
        atMs: delta,
        title: `Navigate to ${navigation.url}`,
        detail: navigation.name || "",
        confidence: score,
        confidenceLabel: confidenceLabel(score)
      });
    });

    const order = { interaction: 0, handler: 1, request: 2, response: 3, async: 4, mutation: 5, exception: 6, navigation: 7 };
    return events.sort((a, b) => a.atMs - b.atMs || (order[a.kind] ?? 99) - (order[b.kind] ?? 99) || a.id.localeCompare(b.id));
  }

  function summarize(session) {
    const timeline = buildTimeline(session);
    const element = session.interaction?.element;
    const subject = element?.text
      ? `“${element.text.slice(0, 60)}”`
      : element?.selector || "the selected element";
    const handlers = timeline.filter((event) => event.kind === "handler");
    const requests = timeline.filter((event) => event.kind === "request");
    const mutations = timeline.filter((event) => event.kind === "mutation");
    const asyncEvents = timeline.filter((event) => event.kind === "async");
    const navigations = timeline.filter((event) => event.kind === "navigation");
    const errors = timeline.filter((event) => event.kind === "exception");
    const authoredHandlers = timeline.filter((event) => event.kind === "handler" && event.origin === "request-initiator");

    const sentences = [`Clicking ${subject} produced ${timeline.length - 1} observed trace events.`];
    if (session.framework?.owner) sentences.push(`The element is owned by ${session.framework.library} component ${session.framework.owner}.`);
    if (handlers.length) sentences.push(`Chrome paused in ${handlers[0].title}.`);
    if (authoredHandlers.length) sentences.push(`The authored request initiator was ${authoredHandlers[0].title}.`);
    if (requests.length) sentences.push(`${requests.length} network request${requests.length === 1 ? " was" : "s were"} observed in the trace window.`);
    if (asyncEvents.length) {
      const capture = session.timerCapture?.mode === "main-world-hook"
        ? "with the local MAIN-world fallback"
        : "with browser instrumentation";
      sentences.push(`${asyncEvents.length} timer event${asyncEvents.length === 1 ? " was" : "s were"} captured ${capture}.`);
    }
    if (mutations.length) sentences.push(`${mutations.length} DOM change group${mutations.length === 1 ? " was" : "s were"} recorded.`);
    if (navigations.length) sentences.push(`${navigations.length} navigation event${navigations.length === 1 ? " was" : "s were"} observed.`);
    if (errors.length) sentences.push(`${errors.length} JavaScript error or warning event${errors.length === 1 ? " was" : "s were"} captured.`);
    if (!handlers.length) sentences.push("No page JavaScript handler frame was captured; native or framework-delegated behaviour may still have occurred.");
    return sentences.join(" ");
  }

  function assessQuality(session) {
    const timeline = session.timeline?.length ? session.timeline : buildTimeline(session);
    const observed = timeline.filter((event) => event.kind !== "interaction");
    const requests = timeline.filter((event) => event.kind === "request");
    const responses = timeline.filter((event) => event.kind === "response");
    const checks = [
      { id: "interaction", passed: Boolean(session.interaction), label: "Interaction captured" },
      { id: "handler", passed: timeline.some((event) => event.kind === "handler"), label: "JavaScript handler captured" },
      { id: "effect", passed: observed.some((event) => !["handler"].includes(event.kind)), label: "Observable effect captured" },
      { id: "confidence", passed: observed.some((event) => event.confidence >= 0.7), label: "Strong supporting evidence" }
    ];
    if (requests.length) {
      checks.push({ id: "responses", passed: responses.length >= requests.length, label: "Network responses completed" });
    }
    if ((session.sourceMaps?.attempted || 0) > 0) {
      checks.push({ id: "source-maps", passed: (session.sourceMaps?.mappedFrames || 0) > 0, label: "Authored source mapped" });
    }

    const passed = checks.filter((check) => check.passed).length;
    const score = Math.round((passed / checks.length) * 100);
    const diagnostics = checks.filter((check) => !check.passed).map((check) => check.label);
    if (session.timerCapture?.fallbackReason) diagnostics.push("Timer tracing used the compatibility fallback");
    for (const error of session.sourceMaps?.errors || []) diagnostics.push(`Source map: ${error.message || error}`);

    return {
      score,
      label: score >= 80 ? "strong" : score >= 50 ? "partial" : "limited",
      observedEvents: observed.length,
      highConfidenceEvents: observed.filter((event) => event.confidence >= 0.7).length,
      checks,
      diagnostics
    };
  }

  const api = {
    asyncEventFrames,
    assessQuality,
    buildTimeline,
    compactFrame,
    confidenceFor,
    confidenceLabel,
    parseBrowserStack,
    sanitizePublicSession,
    summarize,
    usefulFrames
  };
  root.TraceCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
