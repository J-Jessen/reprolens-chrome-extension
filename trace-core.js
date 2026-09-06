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

  function serializedBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  }

  function limitHistory(traces, maxCount = 25, maxBytes = 5_000_000) {
    const kept = [];
    let bytes = serializedBytes(kept);
    for (const trace of (traces || []).slice(0, maxCount)) {
      const itemBytes = serializedBytes(trace) + (kept.length ? 1 : 0);
      if (bytes + itemBytes > maxBytes) continue;
      kept.push(trace);
      bytes += itemBytes;
    }
    return { traces: kept, bytes };
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

  function networkScope(requestUrl, pageUrl) {
    try {
      const request = new URL(requestUrl, pageUrl);
      const page = new URL(pageUrl);
      return request.origin === page.origin ? "same-origin" : "cross-origin";
    } catch (_) {
      return "unknown-origin";
    }
  }

  function siteOriginPattern(value) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      return `${url.protocol}//${url.host}/*`;
    } catch (_) {
      return null;
    }
  }

  function eventCategory(event) {
    if (["request", "response", "network-failure"].includes(event?.kind)) return "network";
    if (event?.kind === "mutation") return "dom";
    if (event?.kind === "exception") return "errors";
    return event?.kind || "unknown";
  }

  function filterTimeline(timeline, category = "all") {
    if (category === "all") return [...(timeline || [])];
    if (category === "primary") {
      return (timeline || []).filter((event) => event.kind === "interaction" || event.primaryChain === true);
    }
    if (category === "same-origin") {
      return (timeline || []).filter((event) => event.kind === "interaction" || event.networkScope === "same-origin");
    }
    return (timeline || []).filter((event) => event.kind === "interaction" || eventCategory(event) === category);
  }

  function eventMetadata(event) {
    const captureMethods = {
      interaction: "content-script", handler: "chrome-debugger", request: "chrome-devtools-protocol",
      response: "chrome-devtools-protocol", "network-failure": "chrome-devtools-protocol",
      websocket: "chrome-devtools-protocol", worker: "main-world-hook", mutation: "content-script",
      exception: "chrome-devtools-protocol", navigation: "chrome-devtools-protocol"
    };
    const privacyClasses = {
      request: "url-metadata", response: "url-metadata", "network-failure": "url-metadata",
      websocket: "metadata-only", worker: "metadata-only", mutation: "dom-summary"
    };
    const relationTypes = {
      handler: "handles-interaction", request: "request-from-handler",
      response: "response-to", "network-failure": "failure-of", websocket: "socket-lifecycle-of",
      worker: "worker-lifecycle-of", async: "async-callback-of", mutation: "dom-effect-of"
    };
    const hasExplicitRelationship = Boolean(event.parentId) && event.kind !== "mutation";
    return {
      ...event,
      relationType: event.relationType || (event.kind === "interaction"
        ? "root"
        : event.parentId ? relationTypes[event.kind] || "child-of" : "observed-after-interaction"),
      relationshipEvidence: event.relationshipEvidence || (event.kind === "interaction"
        ? "root"
        : hasExplicitRelationship ? "explicit" : event.parentId ? "correlated" : "none"),
      captureMethod: event.captureMethod || captureMethods[event.kind] || "derived",
      privacyClassification: event.privacyClassification || privacyClasses[event.kind] || "source-metadata"
    };
  }

  function markPrimaryChain(timeline) {
    const events = (timeline || []).map((event) => ({ ...event, primaryChain: false }));
    const primaryIds = new Set(events
      .filter((event) => event.kind === "interaction" || event.relationType === "root")
      .map((event) => event.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const event of events) {
        if (primaryIds.has(event.id) || event.relationshipEvidence !== "explicit" || event.confidence < 0.7) continue;
        if (event.parentId && primaryIds.has(event.parentId)) {
          primaryIds.add(event.id);
          changed = true;
        }
      }
    }
    return events.map((event) => ({ ...event, primaryChain: primaryIds.has(event.id) }));
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
      initiatorCallFrames: (item.initiatorCallFrames || []).map(compactFrame).filter(Boolean),
      initiatorAsyncStack: compactAsyncStack(item.initiatorAsyncStack)
    }));
    copy.asyncEvents = (copy.asyncEvents || []).map((event) => ({
      ...event,
      callFrames: (event.callFrames || []).map(compactFrame).filter(Boolean),
      asyncStackTrace: compactAsyncStack(event.asyncStackTrace)
    }));
    copy.workerEvents = (copy.workerEvents || []).map((event) => ({
      ...event,
      callFrames: (event.callFrames || []).map(compactFrame).filter(Boolean)
    }));
    copy.timeline = (copy.timeline || []).map((event) => ({
      ...event,
      ...(event.location ? { location: compactFrame(event.location) } : {}),
      ...(event.frames ? { frames: event.frames.map(compactFrame).filter(Boolean) } : {})
    }));
    return copy;
  }

  function redactUrl(value, report) {
    try {
      const url = new URL(value);
      const sensitive = /token|key|secret|password|passcode|auth|session|code/i;
      for (const key of [...url.searchParams.keys()]) {
        if (sensitive.test(key)) {
          url.searchParams.set(key, "[REDACTED]");
          report.urlParameters += 1;
        }
      }
      return url.toString();
    } catch (_) {
      return value;
    }
  }

  function redactString(value, report) {
    let redacted = redactUrl(value, report);
    redacted = redacted.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, () => {
      report.emailAddresses += 1;
      return "[REDACTED_EMAIL]";
    });
    redacted = redacted.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, () => {
      report.credentials += 1;
      return "Bearer [REDACTED]";
    });
    redacted = redacted.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{8,})?/g, () => {
      report.credentials += 1;
      return "[REDACTED_TOKEN]";
    });
    redacted = redacted.replace(/(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passcode)\b\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi, (match, prefix, credential) => {
      if (/(?:%5B|\[)REDACTED(?:%5D|\])/i.test(credential)) return match;
      report.credentials += 1;
      return `${prefix}[REDACTED]`;
    });
    const secretPatterns = [
      /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g,
      /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
      /\bnpm_[A-Za-z0-9]{20,}\b/g,
      /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g
    ];
    for (const pattern of secretPatterns) {
      redacted = redacted.replace(pattern, () => {
        report.credentials += 1;
        return "[REDACTED_SECRET]";
      });
    }
    redacted = redacted.replace(/-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g, () => {
      report.credentials += 1;
      return "[REDACTED_PRIVATE_KEY]";
    });
    if (/</.test(redacted)) {
      redacted = redacted.replace(/\s(value|data-token|data-secret|data-password)=(['"])[\s\S]*?\2/gi, (_match, name, quote) => {
        report.domValues += 1;
        return ` ${name}=${quote}[REDACTED]${quote}`;
      });
    }
    return redacted;
  }

  function redactForExport(session) {
    const report = { sensitiveFields: 0, urlParameters: 0, emailAddresses: 0, credentials: 0, domValues: 0 };
    const sensitiveKey = /^(?:authorization|cookie|cookies|password|passcode|secret|token|accessToken|refreshToken|requestBody|responseBody|postData)$/i;
    function visit(value, key = "") {
      if (sensitiveKey.test(key)) {
        report.sensitiveFields += 1;
        return "[REDACTED]";
      }
      if (typeof value === "string") return redactString(value, report);
      if (Array.isArray(value)) return value.map((item) => visit(item));
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, visit(child, childKey)]));
      }
      return value;
    }
    const trace = visit(sanitizePublicSession(session));
    return { trace, report, totalRedactions: Object.values(report).reduce((sum, count) => sum + count, 0) };
  }

  function validateImportedTrace(trace) {
    if (!trace || typeof trace !== "object" || Array.isArray(trace)) return { ok: false, error: "Trace must be a JSON object." };
    if (![1, 2].includes(trace.schemaVersion)) return { ok: false, error: `Unsupported schema version: ${trace.schemaVersion ?? "missing"}.` };
    if (trace.status !== "complete") return { ok: false, error: "Only completed traces can be imported." };
    if (!Array.isArray(trace.timeline) || !trace.timeline.every((event) => event && typeof event.kind === "string")) {
      return { ok: false, error: "Trace timeline is invalid." };
    }
    return { ok: true, error: null };
  }

  function migrateTrace(trace) {
    const validation = validateImportedTrace(trace);
    if (!validation.ok) throw new Error(validation.error);
    const copy = JSON.parse(JSON.stringify(trace));
    if (copy.schemaVersion === 1) {
      copy.schemaVersion = 2;
      copy.traceId = copy.traceId || `legacy-${copy.startedAt || copy.savedAt || "unknown"}-${copy.tabId || "tab"}`;
    }
    copy.timeline = markPrimaryChain((copy.timeline || []).map(eventMetadata));
    return copy;
  }

  function markdownReport(session) {
    const { trace } = redactForExport(session);
    const clean = (value) => String(value || "").replace(/[\r\n]+/g, " ").trim();
    const explanation = explain(trace);
    const lines = [
      "# Behaviour trace",
      "",
      `- Page: ${clean(trace.pageUrl) || "Unknown"}`,
      `- Element: ${clean(trace.selectedElement?.text || trace.selectedElement?.selector) || "Unknown"}`,
      `- Quality: ${trace.quality?.score ?? 0}% (${trace.quality?.label || "unknown"})`,
      "",
      "## What happened",
      "",
      clean(explanation.headline),
      ""
    ];
    for (const step of explanation.steps) {
      lines.push(`- **${clean(step.label)} — ${clean(step.title)}** (${clean(step.relation)}): ${clean(step.detail)}`);
    }
    lines.push(
      "",
      clean(explanation.evidenceNote),
      "",
      "## Technical summary",
      "",
      clean(trace.summary) || "No summary available.",
      "",
      "## Technical timeline",
      ""
    );
    for (const event of trace.timeline || []) {
      lines.push(`- **+${event.atMs || 0}ms · ${clean(event.kind)}:** ${clean(event.title)}${event.detail ? ` — ${clean(event.detail)}` : ""}`);
    }
    return `${lines.join("\n")}\n`;
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
      const allInitiatorFrames = usefulFrames([
        ...(item.initiatorCallFrames || []),
        ...flattenAsyncStack(item.initiatorAsyncStack)
      ], 50);
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

    const displayedHandlerIdsByKey = new Map();
    (session.handlers || []).filter(aroundInteraction).forEach((handler, index) => {
      const frames = usefulFrames(handler.callFrames, 5);
      const top = frames[0];
      if (!top || isNoiseHandler(top)) return;
      const key = frameKey(top);
      if (displayedHandlerIdsByKey.has(key)) return;
      const id = `handler-${index}`;
      displayedHandlerIdsByKey.set(key, id);
      events.push({
        id,
        kind: "handler",
        atMs: relativeMs(handler.at, origin, session.startedAt),
        title: top ? `${top.functionName}()` : "JavaScript event listener",
        detail: locationLabel(top) || handler.eventName || "click listener",
        location: top || null,
        frames,
        parentId: session.interaction ? "interaction" : null,
        confidence: 1,
        confidenceLabel: "direct"
      });
    });

    const relevantNetwork = (session.network || []).filter(afterInteraction);
    const requestById = new Map();
    const requestEventIdById = new Map();
    relevantNetwork.forEach((item, index) => {
      if (item.phase === "request") requestById.set(item.requestId, item);
      if (item.phase === "request") requestEventIdById.set(item.requestId, `network-${index}`);
    });

    const socketById = new Map();
    (session.webSockets || []).filter(afterInteraction).forEach((item, index) => {
      if (item.phase === "created") socketById.set(item.requestId, { ...item, eventId: `websocket-${index}` });
      const created = socketById.get(item.requestId);
      const socketUrl = created?.url || item.url || "WebSocket";
      const scope = networkScope(socketUrl.replace(/^ws/, "http"), session.pageUrl);
      const labels = {
        created: `WebSocket connect ${socketUrl}`,
        open: `WebSocket open${item.status ? ` · ${item.status}` : ""}`,
        sent: "WebSocket frame sent",
        received: "WebSocket frame received",
        closed: "WebSocket closed"
      };
      events.push({
        id: `websocket-${index}`,
        kind: "websocket",
        atMs: relativeMs(item.at, origin, session.startedAt),
        title: labels[item.phase] || `WebSocket ${item.phase}`,
        detail: `${scope}${item.payloadBytes != null ? ` · ${item.payloadBytes} payload bytes (content not captured)` : ""}`,
        networkScope: scope,
        parentId: item.phase === "created" ? null : created?.eventId || null,
        confidence: item.phase === "created" ? 0.88 : 0.82,
        confidenceLabel: "strong"
      });
    });

    relevantNetwork.forEach((item, index) => {
      const delta = relativeMs(item.at, origin, session.startedAt);
      const kind = item.phase === "response" ? "response" : item.phase === "failure" ? "network-failure" : "request";
      const request = item.phase === "request" ? item : requestById.get(item.requestId);
      const scope = networkScope(request?.url || item.url, session.pageUrl);
      const evidence = request ? requestEvidence(request) : { allInitiatorFrames: [], displayFrames: [], matchesHandler: false };
      const initiatorFrames = evidence.displayFrames;
      const score = item.phase === "response" || item.phase === "failure"
        ? Math.min(0.92, request ? requestConfidence(request) - 0.06 : confidenceFor(kind, delta))
        : requestConfidence(item);
      const durationMs = request ? Math.max(0, Math.round(item.at - request.at)) : null;

      if (item.phase === "request") {
        const authoredFrame = evidence.allInitiatorFrames[0];
        const authoredKey = authoredFrame ? frameKey(authoredFrame) : "";
        if (evidence.matchesHandler && authoredFrame && authoredFrame.functionName !== "(anonymous)" && !displayedHandlerIdsByKey.has(authoredKey)) {
          const id = `initiator-handler-${index}`;
          displayedHandlerIdsByKey.set(authoredKey, id);
          events.push({
            id,
            kind: "handler",
            origin: "request-initiator",
            atMs: Math.max(0, delta - 1),
            title: `${authoredFrame.functionName}()`,
            detail: `authored request initiator${locationLabel(authoredFrame) ? ` · ${locationLabel(authoredFrame)}` : ""}`,
            location: authoredFrame,
            frames: initiatorFrames,
            parentId: session.interaction ? "interaction" : null,
            confidence: 0.95,
            confidenceLabel: "direct"
          });
        }
      }

      const requestParentId = item.phase === "request"
        ? evidence.allInitiatorFrames.map((frame) => displayedHandlerIdsByKey.get(frameKey(frame))).find(Boolean) || null
        : null;

      events.push({
        id: `network-${index}`,
        kind,
        atMs: delta,
        title: item.phase === "response"
          ? `${item.status || ""} ${request?.url || item.url || "response"}`.trim()
          : item.phase === "failure"
            ? `FAILED ${request?.url || item.url || "request"}`
          : `${item.method || "GET"} ${item.url}`,
        detail: `${scope} · ${item.type || "Network"}${item.errorText ? ` · ${item.errorText}` : ""}${durationMs != null && item.phase !== "request" ? ` · ${durationMs}ms` : ""}${initiatorFrames[0] ? ` · from ${initiatorFrames[0].functionName}()` : ""}${locationLabel(initiatorFrames[0]) ? ` · ${locationLabel(initiatorFrames[0])}` : ""}`,
        networkScope: scope,
        durationMs: item.phase === "request" ? null : durationMs,
        parentId: item.phase !== "request" ? requestEventIdById.get(item.requestId) || null : requestParentId,
        location: initiatorFrames[0] || null,
        frames: initiatorFrames,
        confidence: normalizeConfidence(score),
        confidenceLabel: confidenceLabel(score)
      });
    });

    const relevantAsyncEvents = (session.asyncEvents || []).filter(afterInteraction).sort((a, b) => a.at - b.at);
    const timerSchedulesByFrame = new Map();
    const timerSchedulesById = new Map();
    const asyncCallbackEventIds = new Map();
    relevantAsyncEvents.forEach((event, index) => {
      const frames = asyncEventFrames(event, 8);
      const top = frames[0];
      if (!top) return;
      const isCallback = event.eventName?.endsWith(".callback");
      const asyncType = event.eventName?.includes("requestAnimationFrame")
        ? "requestAnimationFrame"
        : event.eventName?.includes("setInterval")
          ? "setInterval"
          : event.eventName?.includes("queueMicrotask")
            ? "queueMicrotask"
            : event.eventName?.includes("Promise") ? "Promise" : "setTimeout";
      const action = `${asyncType} ${isCallback ? "callback" : "scheduled"}`;
      const id = `async-${index}`;
      const asyncParent = isCallback
        ? usefulFrames(flattenAsyncStack(event.asyncStackTrace), 8)[0]
        : null;
      const parentId = (event.timerId != null ? timerSchedulesById.get(event.timerId) : null)
        || (asyncParent ? timerSchedulesByFrame.get(frameKey(asyncParent)) : null)
        || (!isCallback ? displayedHandlerIdsByKey.get(frameKey(top)) : null)
        || null;
      const captureLabel = event.captureMode === "main-world-hook"
        ? "local MAIN-world async hook"
        : "browser async instrumentation";
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
        relationType: parentId ? (isCallback ? "async-callback-of" : "async-scheduled-by") : null,
        location: top,
        frames,
        confidence: score,
        confidenceLabel: confidenceLabel(score)
      });
      if (!isCallback) {
        timerSchedulesByFrame.set(frameKey(top), id);
        if (event.timerId != null) timerSchedulesById.set(event.timerId, id);
      } else {
        asyncCallbackEventIds.set(event, id);
      }
    });

    const workerCreatedById = new Map();
    (session.workerEvents || []).filter(afterInteraction).forEach((event, index) => {
      const id = `worker-${index}`;
      if (event.phase === "created") workerCreatedById.set(event.workerId, id);
      const frames = usefulFrames(event.callFrames, 5);
      const labels = {
        created: `Worker created${event.url ? ` · ${event.url}` : ""}`,
        sent: "Worker message sent",
        received: "Worker message received",
        error: "Worker error"
      };
      events.push({
        id,
        kind: "worker",
        atMs: relativeMs(event.at, origin, session.startedAt),
        title: labels[event.phase] || `Worker ${event.phase}`,
        detail: `${event.phase === "created" ? "creation metadata" : "message content not captured"}${locationLabel(frames[0]) ? ` · ${locationLabel(frames[0])}` : ""}`,
        parentId: event.phase === "created" ? null : workerCreatedById.get(event.workerId) || null,
        location: frames[0] || null,
        frames,
        confidence: 0.95,
        confidenceLabel: "direct"
      });
    });

    const asyncCallbacks = relevantAsyncEvents.filter((event) => event.eventName?.endsWith(".callback"));

    const relevantMutations = (session.mutations || []).filter(afterInteraction);
    relevantMutations.filter((mutation) => {
      if (mutation.summary !== "Attribute “class” changed") return true;
      return !relevantMutations.some((other) => other !== mutation
        && other.target === mutation.target
        && Math.abs(other.at - mutation.at) <= 1
        && !other.summary.startsWith("Attribute “"));
    }).forEach((mutation, index) => {
      const delta = relativeMs(mutation.at, origin, session.startedAt);
      const adjacentCallback = asyncCallbacks
        .filter((event) => Math.abs(event.at - mutation.at) <= 20)
        .sort((a, b) => Math.abs(a.at - mutation.at) - Math.abs(b.at - mutation.at))[0];
      const followsAsyncCallback = Boolean(adjacentCallback);
      const score = followsAsyncCallback ? 0.9 : confidenceFor("mutation", delta);
      events.push({
        id: `mutation-${index}`,
        kind: "mutation",
        atMs: delta,
        title: mutation.summary,
        detail: `${mutation.target || "DOM"}${followsAsyncCallback ? " · immediately after async callback" : ""}`,
        parentId: adjacentCallback ? asyncCallbackEventIds.get(adjacentCallback) || null : null,
        relationType: adjacentCallback ? "observed-after-async-callback" : null,
        relationshipEvidence: adjacentCallback ? "correlated" : "none",
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

    const order = { interaction: 0, handler: 1, request: 2, response: 3, "network-failure": 3, async: 4, worker: 4, websocket: 4, mutation: 5, exception: 6, navigation: 7 };
    return markPrimaryChain(events
      .sort((a, b) => a.atMs - b.atMs || (order[a.kind] ?? 99) - (order[b.kind] ?? 99) || a.id.localeCompare(b.id))
      .map(eventMetadata));
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
    const socketEvents = timeline.filter((event) => event.kind === "websocket");
    const workerEvents = timeline.filter((event) => event.kind === "worker");
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
      sentences.push(`${asyncEvents.length} async boundary event${asyncEvents.length === 1 ? " was" : "s were"} captured ${capture}.`);
    }
    if (mutations.length) sentences.push(`${mutations.length} DOM change group${mutations.length === 1 ? " was" : "s were"} recorded.`);
    if (navigations.length) sentences.push(`${navigations.length} navigation event${navigations.length === 1 ? " was" : "s were"} observed.`);
    if (socketEvents.length) sentences.push(`${socketEvents.length} WebSocket lifecycle event${socketEvents.length === 1 ? " was" : "s were"} observed without capturing message contents.`);
    if (workerEvents.length) sentences.push(`${workerEvents.length} Worker lifecycle event${workerEvents.length === 1 ? " was" : "s were"} observed without capturing message contents.`);
    if (errors.length) sentences.push(`${errors.length} JavaScript error or warning event${errors.length === 1 ? " was" : "s were"} captured.`);
    if (!handlers.length) sentences.push("No page JavaScript handler frame was captured; native or framework-delegated behaviour may still have occurred.");
    return sentences.join(" ");
  }

  function readableSubject(session) {
    const element = session.interaction?.element || session.selectedElement;
    const text = String(element?.text || "").trim().replace(/\s+/g, " ");
    if (text) return `“${text.slice(0, 60)}”`;
    return element?.selector || "the selected element";
  }

  function readableUrl(value, pageUrl) {
    try {
      const url = new URL(value, pageUrl);
      const sensitive = /token|key|secret|password|passcode|auth|session|code/i;
      for (const key of [...url.searchParams.keys()]) {
        if (sensitive.test(key)) url.searchParams.set(key, "[REDACTED]");
      }
      const page = new URL(pageUrl);
      return url.origin === page.origin
        ? `${url.pathname}${url.search}${url.hash}`
        : `${url.hostname}${url.pathname}`;
    } catch (_) {
      return String(value || "").slice(0, 100);
    }
  }

  function relationLabel(event) {
    if (event?.kind === "interaction") return "Starting point";
    return event?.primaryChain && event?.relationshipEvidence === "explicit"
      ? "Direct link"
      : "Observed after click";
  }

  function explain(session) {
    const timeline = session.timeline?.length ? session.timeline : buildTimeline(session);
    const subject = readableSubject(session);
    const interaction = timeline.find((event) => event.kind === "interaction");
    const handlers = timeline.filter((event) => event.kind === "handler");
    const asyncEvents = timeline.filter((event) => event.kind === "async");
    const requests = timeline.filter((event) => event.kind === "request");
    const responses = timeline.filter((event) => event.kind === "response");
    const failures = timeline.filter((event) => event.kind === "network-failure");
    const mutations = timeline.filter((event) => event.kind === "mutation");
    const navigations = timeline.filter((event) => event.kind === "navigation");
    const errors = timeline.filter((event) => event.kind === "exception");
    const steps = [];

    steps.push({
      kind: "action",
      label: "Your action",
      title: `You clicked ${subject}`,
      detail: "This is the interaction the trace followed.",
      relation: relationLabel(interaction)
    });

    if (handlers.length) {
      const authored = handlers.find((event) => event.origin === "request-initiator") || handlers[0];
      const functionName = String(authored.title || "").replace(/\(\)$/, "");
      const generic = !functionName || ["(anonymous)", "anonymous", "n"].includes(functionName);
      const location = locationLabel(authored.location || authored.frames?.[0]);
      const framework = session.framework?.owner
        ? `${session.framework.library || "Framework"} component ${session.framework.owner}`
        : "";
      const detailParts = [generic && !authored.location?.originalLocation
        ? "The browser found the handler boundary, but not a readable function name. This can happen with anonymous, framework-managed, bundled, or minified code."
        : location ? `Found in ${location}.` : "The original source location was not available."];
      if (framework) detailParts.push(`The element belongs to ${framework}.`);
      if (asyncEvents.length) {
        detailParts.push(`${asyncEvents.length} delayed or asynchronous code step${asyncEvents.length === 1 ? " was" : "s were"} also observed.`);
      }
      steps.push({
        kind: "code",
        label: "Page code",
        title: generic ? "Page code handled the click" : `${functionName}() handled the click`,
        detail: detailParts.join(" "),
        relation: relationLabel(authored)
      });
    } else {
      steps.push({
        kind: "code",
        label: "Page code",
        title: "No readable JavaScript handler was identified",
        detail: "The action may use browser behaviour, framework delegation, or minified code without a source map.",
        relation: "Limited evidence"
      });
    }

    if (requests.length || failures.length) {
      const requestLabels = requests.slice(0, 2).map((event) => {
        const rawUrl = String(event.title || "").replace(/^\S+\s+/, "");
        return readableUrl(rawUrl, session.pageUrl);
      });
      const successfulResponses = responses.filter((event) => Number.parseInt(event.title, 10) < 400).length;
      const failedResponses = responses.filter((event) => Number.parseInt(event.title, 10) >= 400).length;
      const hasNetworkProblem = failures.length > 0 || failedResponses > 0;
      const requestCount = requests.length;
      const resultParts = [];
      if (requestLabels.length) resultParts.push(`Requests: ${requestLabels.join(", ")}.`);
      if (successfulResponses) resultParts.push(`${successfulResponses} completed successfully.`);
      if (failures.length + failedResponses) resultParts.push(`${failures.length + failedResponses} failed or returned an error response.`);
      const anchor = requests.find((event) => event.primaryChain) || requests[0] || failures[0];
      steps.push({
        kind: hasNetworkProblem ? "problem" : "network",
        label: "Data request",
        title: requestCount === 1
          ? "The page requested data"
          : `The page started ${requestCount} data requests`,
        detail: resultParts.join(" ") || "A request problem was observed.",
        relation: relationLabel(anchor)
      });
    }

    if (mutations.length) {
      const examples = mutations.slice(0, 2).map((event) => event.title).filter(Boolean);
      steps.push({
        kind: "change",
        label: "Page result",
        title: mutations.length === 1 ? "The page content changed" : `The page changed in ${mutations.length} places`,
        detail: examples.length ? `${examples.join("; ")}.` : "The trace observed changes to the page content.",
        relation: relationLabel(mutations[0])
      });
    }

    if (navigations.length) {
      const destination = String(navigations[0].title || "").replace(/^Navigate to\s+/, "");
      const sameDocument = ["historyApi", "fragment", "same-document"].some((name) => String(navigations[0].detail || "").includes(name));
      steps.push({
        kind: "navigation",
        label: "Navigation",
        title: sameDocument ? "The address changed without a full page reload" : "The page navigated to another address",
        detail: `Destination: ${readableUrl(destination, session.pageUrl)}.`,
        relation: relationLabel(navigations[0])
      });
    }

    if (errors.length) {
      steps.push({
        kind: "problem",
        label: "Problem detected",
        title: errors.length === 1 ? "A warning or error occurred" : `${errors.length} warnings or errors occurred`,
        detail: errors.slice(0, 2).map((event) => event.title).join("; "),
        relation: relationLabel(errors[0])
      });
    }

    let headline = "The click ran page code";
    const hasNetworkProblem = failures.length > 0 || responses.some((event) => Number.parseInt(event.title, 10) >= 400);
    if (errors.length || hasNetworkProblem) headline = "The trace captured a problem after the click";
    else if (navigations.length) headline = "The click opened another view";
    else if (requests.length && mutations.length) headline = "The click requested data and updated the page";
    else if (mutations.length) headline = "The click updated the page";
    else if (requests.length) headline = "The click started a data request";

    const hasUnlinkedEvidence = timeline.some((event) => event.kind !== "interaction" && !event.primaryChain);
    const evidenceNote = hasUnlinkedEvidence
      ? "Direct links are supported by browser evidence. Items marked “Observed after click” happened in the same short trace window, but the trace could not prove that the click caused them."
      : "The main steps are connected by direct browser evidence.";

    return {
      headline,
      overview: `${steps.length} step${steps.length === 1 ? " was" : "s were"} observed from your action to the result.`,
      steps,
      evidenceNote
    };
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
    eventCategory,
    explain,
    filterTimeline,
    limitHistory,
    markdownReport,
    markPrimaryChain,
    migrateTrace,
    networkScope,
    parseBrowserStack,
    redactForExport,
    sanitizePublicSession,
    serializedBytes,
    siteOriginPattern,
    summarize,
    validateImportedTrace,
    usefulFrames
  };
  root.TraceCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
