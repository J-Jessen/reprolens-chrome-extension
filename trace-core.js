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
    if (event?.kind === "frame") return "contexts";
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
      frame: "chrome-devtools-protocol", exception: "chrome-devtools-protocol", navigation: "chrome-devtools-protocol"
    };
    const privacyClasses = {
      request: "url-metadata", response: "url-metadata", "network-failure": "url-metadata",
      websocket: "metadata-only", worker: "metadata-only", frame: "metadata-only", mutation: "dom-summary"
    };
    const relationTypes = {
      handler: "handles-interaction", request: "request-from-handler",
      response: "response-to", "network-failure": "failure-of", websocket: "socket-lifecycle-of",
      worker: "worker-lifecycle-of", frame: "frame-lifecycle-of", async: "async-callback-of", mutation: "dom-effect-of"
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
    delete copy.debuggerContexts;
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
    redacted = redacted.replace(/(\b(?:api[\s_-]?key|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passcode)\b\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi, (match, prefix, credential) => {
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
    const recordedSteps = Array.isArray(session.multiSteps) && session.multiSteps.length
      ? session.multiSteps
      : [];
    const origin = recordedSteps[0]?.at || session.interactionAt || session.startedAt;
    const events = [];
    const firstInteractionAt = recordedSteps[0]?.at || session.interactionAt;
    const afterInteraction = (item) => !firstInteractionAt || item.at >= firstInteractionAt;
    const aroundInteraction = (item) => !firstInteractionAt || item.at >= firstInteractionAt - 100;
    const interactionId = (step) => recordedSteps.length ? `interaction-${step.stepId}` : "interaction";
    const parentInteractionId = (item) => {
      if (!recordedSteps.length) return session.interaction ? "interaction" : null;
      if (item?.stepId != null) return `interaction-${item.stepId}`;
      const preceding = [...recordedSteps].reverse().find((step) => step.at <= (item?.at || 0));
      return preceding ? interactionId(preceding) : interactionId(recordedSteps[0]);
    };
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

    const interactions = recordedSteps.length ? recordedSteps : session.interaction ? [session.interaction] : [];
    interactions.forEach((step, index) => {
      const component = !recordedSteps.length && session.framework?.owner
        ? `${session.framework.library || "Framework"} · ${session.framework.owner}`
        : "";
      events.push({
        id: interactionId(step),
        kind: "interaction",
        stepNumber: recordedSteps.length ? index + 1 : null,
        atMs: relativeMs(step.at || session.interactionAt, origin, session.startedAt),
        title: `${step.eventType || "click"} ${step.element?.selector || "element"}`,
        detail: [step.element?.text || step.element?.tagName || "", component].filter(Boolean).join(" · "),
        confidence: 1,
        confidenceLabel: "direct"
      });
    });

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
        detail: [locationLabel(top) || handler.eventName || "event listener", handler.contextType && handler.contextType !== "page" ? `${handler.contextType} context` : ""].filter(Boolean).join(" · "),
        contextId: handler.contextId || null,
        contextType: handler.contextType || "page",
        location: top || null,
        frames,
        parentId: parentInteractionId(handler),
        confidence: 1,
        confidenceLabel: "direct"
      });
    });

    const relevantNetwork = (session.network || []).filter(afterInteraction);
    const networkKey = (item) => `${item.contextId || "page"}:${item.requestId}`;
    const requestById = new Map();
    const requestEventIdById = new Map();
    relevantNetwork.forEach((item, index) => {
      if (item.phase === "request") requestById.set(networkKey(item), item);
      if (item.phase === "request") requestEventIdById.set(networkKey(item), `network-${index}`);
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
      const request = item.phase === "request" ? item : requestById.get(networkKey(item));
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
            parentId: parentInteractionId(item),
            confidence: 0.95,
            confidenceLabel: "direct"
          });
        }
      }

      const requestParentId = item.phase === "request"
        ? evidence.allInitiatorFrames.map((frame) => displayedHandlerIdsByKey.get(frameKey(frame))).find(Boolean) || parentInteractionId(item)
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
        detail: `${scope} · ${item.type || "Network"}${item.contextType && item.contextType !== "page" ? ` · ${item.contextType} context` : ""}${item.errorText ? ` · ${item.errorText}` : ""}${durationMs != null && item.phase !== "request" ? ` · ${durationMs}ms` : ""}${initiatorFrames[0] ? ` · from ${initiatorFrames[0].functionName}()` : ""}${locationLabel(initiatorFrames[0]) ? ` · ${locationLabel(initiatorFrames[0])}` : ""}`,
        method: request?.method || item.method || "GET",
        url: request?.url || item.url || "",
        status: item.phase === "response" ? Number(item.status) || 0 : null,
        statusText: item.phase === "response" ? item.statusText || "" : "",
        errorText: item.phase === "failure" ? item.errorText || "Request failed" : "",
        canceled: item.phase === "failure" ? Boolean(item.canceled) : false,
        contextId: item.contextId || request?.contextId || null,
        contextType: item.contextType || request?.contextType || "page",
        networkScope: scope,
        durationMs: item.phase === "request" ? null : durationMs,
        parentId: item.phase !== "request" ? requestEventIdById.get(networkKey(item)) || null : requestParentId,
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
        attached: `${event.contextType === "shared_worker" ? "Shared Worker" : "Worker"} execution context attached${event.url ? ` · ${event.url}` : ""}`,
        sent: "Worker message sent",
        received: "Worker message received",
        error: "Worker error"
      };
      events.push({
        id,
        kind: "worker",
        atMs: relativeMs(event.at, origin, session.startedAt),
        title: labels[event.phase] || `Worker ${event.phase}`,
        detail: `${["created", "attached"].includes(event.phase) ? "execution metadata and internal errors/requests enabled" : "message content not captured"}${event.captureStatus === "partial" ? " · partial child-target coverage" : ""}${locationLabel(frames[0]) ? ` · ${locationLabel(frames[0])}` : ""}`,
        parentId: event.phase === "created" ? null : workerCreatedById.get(event.workerId) || null,
        location: frames[0] || null,
        frames,
        confidence: 0.95,
        confidenceLabel: "direct"
      });
    });

    (session.frameEvents || []).filter(afterInteraction).forEach((event, index) => {
      events.push({
        id: `frame-${index}`,
        kind: "frame",
        atMs: relativeMs(event.at, origin, session.startedAt),
        title: `Cross-origin frame context attached${event.url ? ` · ${event.url}` : ""}`,
        detail: event.captureStatus === "partial"
          ? "Frame metadata is visible, but some internal evidence could not be enabled."
          : "Frame requests, errors, and readable handlers can now be observed without reading frame content.",
        contextId: event.frameId || null,
        confidence: 1,
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
        title: String(exception.exceptionDescription || exception.text || "JavaScript exception").split("\n")[0],
        detail: [exception.url || "", exception.contextType && exception.contextType !== "page" ? `${exception.contextType} context` : ""].filter(Boolean).join(" · "),
        contextId: exception.contextId || null,
        contextType: exception.contextType || "page",
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
        detail: [entry.url || "", entry.contextType && entry.contextType !== "page" ? `${entry.contextType} context` : ""].filter(Boolean).join(" · "),
        contextId: entry.contextId || null,
        contextType: entry.contextType || "page",
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
        title: `${navigation.parentFrameId || navigation.contextType === "iframe" ? "Frame navigated to" : "Navigate to"} ${navigation.url}`,
        detail: [navigation.name || "", navigation.contextType === "iframe" ? "cross-origin iframe" : ""].filter(Boolean).join(" · "),
        contextId: navigation.contextId || null,
        contextType: navigation.contextType || "page",
        confidence: score,
        confidenceLabel: confidenceLabel(score)
      });
    });

    const order = { interaction: 0, handler: 1, frame: 2, request: 3, response: 4, "network-failure": 4, async: 5, worker: 5, websocket: 5, mutation: 6, exception: 7, navigation: 8 };
    return markPrimaryChain(events
      .sort((a, b) => a.atMs - b.atMs || (order[a.kind] ?? 99) - (order[b.kind] ?? 99) || a.id.localeCompare(b.id))
      .map(eventMetadata));
  }

  function summarize(session) {
    const timeline = buildTimeline(session);
    const stepCount = Array.isArray(session.multiSteps) ? session.multiSteps.length : 0;
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
    const frameEvents = timeline.filter((event) => event.kind === "frame");
    const errors = timeline.filter((event) => event.kind === "exception");
    const authoredHandlers = timeline.filter((event) => event.kind === "handler" && event.origin === "request-initiator");

    const interactionCount = stepCount || (session.interaction ? 1 : 0);
    const observedCount = Math.max(0, timeline.length - interactionCount);
    const sentences = stepCount
      ? [`The recorded journey included ${stepCount} interaction${stepCount === 1 ? "" : "s"} and ${observedCount} observed trace event${observedCount === 1 ? "" : "s"}.`]
      : [`${interactionGerund(session, true)} produced ${observedCount} observed trace events.`];
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
    if (frameEvents.length) sentences.push(`${frameEvents.length} cross-origin frame context${frameEvents.length === 1 ? " was" : "s were"} attached without reading frame content.`);
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

  function shorten(value, maximum = 56) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    if (text.length <= maximum) return text;
    return `${text.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
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

  function conciseUrl(value, pageUrl) {
    try {
      const url = new URL(value, pageUrl);
      const page = new URL(pageUrl);
      const label = url.origin === page.origin
        ? url.pathname
        : `${url.hostname}${url.pathname}`;
      return shorten(label || "/", 52);
    } catch (_) {
      return shorten(String(value || "").split(/[?#]/, 1)[0], 52);
    }
  }

  function requestUrl(event) {
    return event?.url || String(event?.title || "").replace(/^\S+\s+/, "");
  }

  function requestMethod(event) {
    return event?.method || String(event?.title || "").match(/^([A-Z]+)\s+/)?.[1] || "GET";
  }

  function responseStatus(event) {
    const explicit = Number(event?.status);
    if (explicit) return explicit;
    return Number.parseInt(event?.title, 10) || 0;
  }

  function standardStatusText(status) {
    return ({
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      408: "Request Timeout",
      409: "Conflict",
      410: "Gone",
      412: "Precondition Failed",
      415: "Unsupported Media Type",
      422: "Unprocessable Content",
      429: "Too Many Requests",
      500: "Internal Server Error",
      502: "Bad Gateway",
      503: "Service Unavailable",
      504: "Gateway Timeout"
    })[status] || "";
  }

  function lowerInitial(value) {
    const text = String(value || "");
    return text ? `${text[0].toLowerCase()}${text.slice(1)}` : text;
  }

  function networkProblemDiagnosis({ request, outcome, pageUrl, relatedMessages = [] }) {
    const method = requestMethod(request);
    const destination = conciseUrl(requestUrl(request), pageUrl) || "the requested address";
    const status = outcome?.kind === "response" ? responseStatus(outcome) : 0;
    const statusText = standardStatusText(status) || outcome?.statusText || "";
    const statusLabel = [status, statusText].filter(Boolean).join(" ");
    const httpDiagnoses = {
      400: ["The server rejected the request because it considered the request invalid.", "Check the request parameters, headers, and body against the endpoint contract."],
      401: ["The server requires valid authentication for this request.", "Check that the user is signed in and that the request sends the expected authentication credentials."],
      403: ["The server understood the request but refused access.", "Check the current user's permissions and the server's access rules for this endpoint."],
      404: ["The server could not find a resource at that address.", "Check that the request URL is correct and that the backend route or file is available in this environment."],
      408: ["The server stopped waiting before the request completed.", "Check for a slow request body, network delay, or a server timeout that is set too low."],
      409: ["The request conflicts with the resource's current state.", "Check for stale data, duplicate operations, or a required version value."],
      410: ["The requested resource was deliberately removed and is no longer available.", "Check whether the client is using an obsolete endpoint or identifier."],
      412: ["A condition attached to the request was not met.", "Check version, ETag, and other precondition headers for stale values."],
      415: ["The server does not accept the request's content format.", "Check the Content-Type header and encode the request body in a supported format."],
      422: ["The server understood the request but could not accept its submitted values.", "Check the submitted fields and show the server's validation message if one is available."],
      429: ["The server rejected the request because too many requests were sent.", "Check the rate limit and add retry or backoff handling where appropriate."],
      500: ["Server-side code failed while processing the request.", "Check the server logs for this endpoint and reproduce the request with the same input."],
      502: ["A gateway received an invalid response from an upstream service.", "Check the upstream service and the gateway or proxy logs."],
      503: ["The service is temporarily unavailable.", "Check service health, deployment status, and whether retry handling is needed."],
      504: ["A gateway timed out while waiting for an upstream service.", "Check the upstream service's response time and the gateway timeout configuration."]
    };

    if (status) {
      const fallback = status >= 500
        ? ["The server failed while processing the request.", "Check the server logs for this endpoint and reproduce the same request."]
        : ["The server rejected the request.", "Check the endpoint contract, request values, authentication, and server logs."];
      const [meaning, check] = httpDiagnoses[status] || fallback;
      return {
        title: `${method} ${destination} returned ${statusLabel}`,
        meaning,
        check
      };
    }

    const errorText = String(outcome?.errorText || outcome?.detail || "Request failed");
    const code = errorText.match(/(?:net::)?(ERR_[A-Z_]+)/)?.[1] || "";
    const relatedText = relatedMessages.map((event) => event.title || event.detail || "").join(" ");
    if (/cors|cross-origin request blocked|access-control-allow-origin/i.test(relatedText)) {
      return {
        title: `${method} ${destination} was blocked by the browser's cross-origin policy`,
        meaning: "The destination did not grant this page permission to read the response.",
        check: "Check the response's Access-Control-Allow-Origin headers, preflight response, credentials mode, and the exact requesting origin."
      };
    }
    const transportDiagnoses = {
      ERR_ABORTED: ["The request was cancelled before a response arrived.", "Check whether navigation, an AbortController, or page code cancelled the request."],
      ERR_ADDRESS_UNREACHABLE: ["The browser could not reach the destination network address.", "Check the host, route, VPN, container network, and local firewall."],
      ERR_BLOCKED_BY_CLIENT: ["The browser or an installed extension blocked the request.", "Check content blockers, privacy tools, and browser request-blocking rules."],
      ERR_CERT_AUTHORITY_INVALID: ["The browser did not trust the server's security certificate.", "Check the certificate issuer, hostname, and local development certificate setup."],
      ERR_CERT_COMMON_NAME_INVALID: ["The server certificate does not match the requested hostname.", "Check the certificate's hostnames and the request URL."],
      ERR_CONNECTION_REFUSED: ["No server accepted the connection at that address.", "Check that the backend is running and that the host and port are correct."],
      ERR_CONNECTION_TIMED_OUT: ["The browser could not establish a connection before timing out.", "Check network access, firewall rules, the host, and the port."],
      ERR_EMPTY_RESPONSE: ["The connection closed without returning response data.", "Check whether the server process crashed, reset the connection, or returned an invalid empty response."],
      ERR_HTTP2_PROTOCOL_ERROR: ["The HTTP/2 connection ended with a protocol error.", "Check the reverse proxy, server HTTP/2 configuration, and intermediary logs."],
      ERR_INTERNET_DISCONNECTED: ["The browser had no network connection.", "Restore the network connection and retry the request."],
      ERR_NAME_NOT_RESOLVED: ["The browser could not resolve the server's hostname.", "Check the hostname, DNS configuration, and local hosts file."],
      ERR_NETWORK_CHANGED: ["The active network changed while the request was running.", "Retry after the connection stabilizes and check VPN or interface switching."],
      ERR_PROXY_CONNECTION_FAILED: ["The configured proxy could not be reached.", "Check browser or system proxy settings and proxy availability."],
      ERR_SSL_PROTOCOL_ERROR: ["The browser and server could not establish a valid secure connection.", "Check TLS versions, certificates, reverse-proxy configuration, and whether HTTPS is expected on this port."],
      ERR_TIMED_OUT: ["The request did not complete before the browser timed out.", "Check network latency and whether the server is responding."],
      ERR_TOO_MANY_REDIRECTS: ["The request entered a redirect loop.", "Inspect the redirect chain and check URL, authentication, and HTTP-to-HTTPS rewrite rules."],
      ERR_FAILED: ["The browser could not complete the request.", "Check the related console message for CORS, certificate, network, or browser-blocking details."]
    };
    const [meaning, check] = transportDiagnoses[code]
      || ["The request ended before the server returned an HTTP response.", "Check the network error, endpoint address, browser console, and server availability."];
    return {
      title: `${method} ${destination} did not receive a response${code ? ` (${code})` : ""}`,
      meaning: outcome?.canceled && code !== "ERR_ABORTED" ? "The request was cancelled before a response arrived." : meaning,
      check
    };
  }

  function exceptionProblemDiagnosis(event) {
    const raw = String(event?.title || "JavaScript error").replace(/^(?:error|warning):\s*/i, "").trim();
    const source = String(event?.detail || "").split(" · ")[0];
    const location = source ? ` The first captured source was ${shorten(source, 80)}.` : "";
    const rules = [
      [/TypeError/i, "Code used a value in a way its runtime type does not support.", "Check the named value for null, undefined, or an unexpected object shape at the first application frame."],
      [/ReferenceError|is not defined/i, "Code referred to a variable or function that was not available in this scope.", "Check spelling, imports, script loading order, and conditional declarations."],
      [/SyntaxError/i, "The browser could not parse or interpret part of the JavaScript.", "Open the first application source location and check the syntax or parsed data mentioned in the message."],
      [/RangeError|Maximum call stack/i, "Code exceeded an allowed numeric, recursion, or stack limit.", "Check for unbounded recursion, repeated state updates, or an invalid size or numeric range."],
      [/SecurityError|permission|denied/i, "The browser blocked an operation because the page lacked permission or crossed a security boundary.", "Check the exact browser policy, origin, iframe, and permission involved."],
      [/AbortError/i, "An asynchronous operation was deliberately aborted before completion.", "Check the AbortController, navigation, cleanup, or replacement request that triggered the cancellation."],
      [/QuotaExceededError/i, "The browser refused a storage operation because its available quota was exceeded.", "Check local storage usage, cleanup behaviour, and the size of the value being stored."]
    ];
    const matched = rules.find(([pattern]) => pattern.test(raw));
    const [, meaning, check] = matched || [null, "JavaScript reported a runtime problem during the trace.", "Open the first application source location, reproduce the interaction, and inspect the values used on that line."];
    return { title: shorten(raw, 110), meaning, check: `${check}${location}` };
  }

  function visibleMutation(event) {
    const title = String(event?.title || "").trim();
    if (!title.startsWith("Text changed to ")) return "";
    let value = title.slice("Text changed to ".length).trim();
    const pairedQuotes = (value.startsWith("“") && value.endsWith("”"))
      || (value.startsWith('"') && value.endsWith('"'));
    if (pairedQuotes) value = value.slice(1, -1);
    return shorten(value, 56);
  }

  function importantVisibleChange(mutations, session) {
    const selectedSelector = session.interaction?.element?.selector || session.selectedElement?.selector || "";
    const visible = mutations
      .map((event) => ({ event, text: visibleMutation(event) }))
      .filter((item) => item.text);
    if (!visible.length) return null;
    return [...visible].reverse().find((item) => selectedSelector && item.event.detail !== selectedSelector)
      || visible[visible.length - 1];
  }

  function relationLabel(event) {
    if (event?.kind === "interaction") return "Starting point";
    return event?.primaryChain && event?.relationshipEvidence === "explicit"
      ? "Direct link"
      : "Observed after interaction";
  }

  function interactionPhrase(session) {
    const subject = readableSubject(session);
    const eventType = session.interaction?.eventType || "click";
    const key = session.interaction?.metadata?.key;
    const phrases = {
      click: `clicked ${subject}`,
      keydown: `used ${key ? `${key} on ` : "the keyboard on "}${subject}`,
      change: `changed ${subject}`,
      submit: `submitted ${subject}`,
      drop: `dropped content on ${subject}`
    };
    return phrases[eventType] || `used ${subject}`;
  }

  function interactionGerund(session, capitalized = false) {
    const subject = readableSubject(session);
    const eventType = session.interaction?.eventType || "click";
    const key = session.interaction?.metadata?.key;
    const phrases = {
      click: `clicking ${subject}`,
      keydown: `using ${key ? `${key} on ` : "the keyboard on "}${subject}`,
      change: `changing ${subject}`,
      submit: `submitting ${subject}`,
      drop: `dropping content on ${subject}`
    };
    const phrase = phrases[eventType] || `using ${subject}`;
    return capitalized ? `${phrase[0].toUpperCase()}${phrase.slice(1)}` : phrase;
  }

  function interactionObject(session) {
    return ({
      click: "click",
      keydown: "keyboard action",
      change: "input change",
      submit: "form submission",
      drop: "drop"
    })[session.interaction?.eventType || "click"] || "interaction";
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
    const frames = timeline.filter((event) => event.kind === "frame");
    const requestDestination = requests.length ? conciseUrl(requestUrl(requests[0]), session.pageUrl) : "";
    const successfulResponses = responses.filter((event) => {
      const status = responseStatus(event);
      return status > 0 && status < 400;
    }).length;
    const failedResponse = responses.find((event) => responseStatus(event) >= 400);
    const failedResponses = responses.filter((event) => responseStatus(event) >= 400).length;
    const hasNetworkProblem = failures.length > 0 || failedResponses > 0;
    const failedOutcome = failedResponse || failures[0] || null;
    const failedRequest = failedOutcome
      ? requests.find((event) => event.id === failedOutcome.parentId) || requests[0] || null
      : null;
    const diagnosis = failedOutcome
      ? networkProblemDiagnosis({ request: failedRequest, outcome: failedOutcome, pageUrl: session.pageUrl, relatedMessages: errors })
      : null;
    const exceptionDiagnosis = !diagnosis && errors.length ? exceptionProblemDiagnosis(errors[0]) : null;
    const importantChange = importantVisibleChange(mutations, session);
    const steps = [];

    steps.push({
      kind: "action",
      label: "Your action",
      title: `You ${interactionPhrase(session)}`,
      detail: "This is the interaction the trace followed.",
      relation: relationLabel(interaction)
    });

    if (handlers.length) {
      const authored = handlers.find((event) => event.id === failedRequest?.parentId)
        || handlers.find((event) => event.origin === "request-initiator")
        || handlers[0];
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
      const frameworkContext = session.framework?.context;
      if (frameworkContext) {
        const propNames = (frameworkContext.props || []).map((prop) => prop.name).slice(0, 6);
        const stateCount = frameworkContext.state?.length || 0;
        const contextParts = [];
        if (propNames.length) contextParts.push(`prop names: ${propNames.join(", ")}`);
        if (stateCount) contextParts.push(`${stateCount} state slot${stateCount === 1 ? "" : "s"}`);
        if (contextParts.length) detailParts.push(`Privacy-safe component shape: ${contextParts.join("; ")}. Values were not captured.`);
      }
      if (asyncEvents.length) {
        detailParts.push(`${asyncEvents.length} delayed or asynchronous code step${asyncEvents.length === 1 ? " was" : "s were"} also observed.`);
      }
      steps.push({
        kind: "code",
        label: "Page code",
        title: generic ? `Page code handled the ${interactionObject(session)}` : `${functionName}() handled the ${interactionObject(session)}`,
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
        return readableUrl(requestUrl(event), session.pageUrl);
      });
      const requestCount = requests.length;
      const resultParts = [];
      if (requestLabels.length) resultParts.push(`Requests: ${requestLabels.join(", ")}.`);
      if (successfulResponses) resultParts.push(`${successfulResponses} completed successfully.`);
      if (failures.length + failedResponses) resultParts.push(`${failures.length + failedResponses} failed or returned an error response.`);
      const anchor = requests.find((event) => event.primaryChain) || requests[0] || failures[0];
      steps.push({
        kind: hasNetworkProblem ? "problem" : "network",
        label: "Data request",
        title: diagnosis?.title || (requestCount === 1
          ? `The page requested ${requestDestination || "data"}`
          : `The page started ${requestCount} data requests`),
        detail: diagnosis ? `${diagnosis.meaning} ${diagnosis.check}` : resultParts.join(" ") || "A request problem was observed.",
        relation: relationLabel(failedRequest || anchor)
      });
    }

    if (mutations.length) {
      const visibleChanges = mutations.map(visibleMutation).filter(Boolean);
      const firstVisibleChange = visibleChanges[0];
      let title = mutations.length === 1 ? "The page content changed" : `The page changed in ${mutations.length} places`;
      if (importantChange?.text && firstVisibleChange && firstVisibleChange !== importantChange.text) {
        title = `The page first showed “${shorten(firstVisibleChange, 42)}” and later “${shorten(importantChange.text, 48)}”`;
      } else if (importantChange?.text) {
        title = `The page showed “${importantChange.text}”`;
      }
      const detail = `${mutations.length === 1 ? "One page change was" : `${mutations.length} page changes were`} observed. The detailed trace lists each changed element.`;
      steps.push({
        kind: "change",
        label: "Page result",
        title,
        detail,
        relation: relationLabel(mutations[0])
      });
    }

    if (navigations.length) {
      const destination = String(navigations[0].title || "").replace(/^(?:Navigate to|Frame navigated to)\s+/, "");
      const sameDocument = ["historyApi", "fragment", "same-document"].some((name) => String(navigations[0].detail || "").includes(name));
      steps.push({
        kind: "navigation",
        label: "Navigation",
        title: sameDocument ? "The address changed without a full page reload" : "The page navigated to another address",
        detail: `Destination: ${readableUrl(destination, session.pageUrl)}.`,
        relation: relationLabel(navigations[0])
      });
    }

    if (frames.length) {
      steps.push({
        kind: "context",
        label: "Embedded context",
        title: `${frames.length} cross-origin frame context${frames.length === 1 ? " was" : "s were"} observed`,
        detail: "The trace can inspect frame request, error, and handler metadata when Chrome exposes a related target, without reading frame content.",
        relation: relationLabel(frames[0])
      });
    }

    if (errors.length) {
      const messages = errors.slice(0, 2).map((event) => shorten(String(event.title || "").replace(/^(?:error|warning):\s*/i, ""), 100));
      const firstMessage = messages[0] || "JavaScript error";
      steps.push({
        kind: "problem",
        label: hasNetworkProblem ? "Related messages" : "Problem detected",
        title: hasNetworkProblem
          ? `The browser or page also logged ${errors.length === 1 ? "one related message" : `${errors.length} related messages`}`
          : `JavaScript reported “${shorten(firstMessage, 72)}”`,
        detail: hasNetworkProblem
          ? messages.map((message) => `“${message}”`).join("; ")
          : `${exceptionDiagnosis?.meaning || "JavaScript reported a runtime problem."} ${exceptionDiagnosis?.check || "Open the first application source location and inspect the values used there."}`,
        relation: relationLabel(errors[0])
      });
    }

    let headline = `After ${interactionGerund(session)}, the page ran code`;
    if (diagnosis) {
      headline = `${diagnosis.title} — ${lowerInitial(diagnosis.meaning.replace(/\.$/, ""))}`;
    } else if (exceptionDiagnosis) {
      headline = `JavaScript reported “${shorten(exceptionDiagnosis.title, 88)}” — ${lowerInitial(exceptionDiagnosis.meaning.replace(/\.$/, ""))}`;
    } else if (navigations.length) {
      const destination = String(navigations[0].title || "").replace(/^(?:Navigate to|Frame navigated to)\s+/, "");
      headline = `After ${interactionGerund(session)}, the browser opened ${conciseUrl(destination, session.pageUrl)}`;
    } else if (requests.length && importantChange?.text) {
      headline = `After ${interactionGerund(session)}, the page requested ${requestDestination || "data"} and later showed “${importantChange.text}”`;
    } else if (requests.length && mutations.length) {
      headline = `After ${interactionGerund(session)}, the page requested ${requestDestination || "data"} and then changed`;
    } else if (importantChange?.text) {
      headline = `After ${interactionGerund(session)}, the page showed “${importantChange.text}”`;
    } else if (mutations.length) {
      headline = `After ${interactionGerund(session)}, the page changed`;
    } else if (requests.length) {
      headline = `After ${interactionGerund(session)}, the page requested ${requestDestination || "data"}`;
    }

    const overviewParts = [];
    if (diagnosis) {
      const sourceHandler = handlers.find((event) => event.id === failedRequest?.parentId)
        || handlers.find((event) => event.origin === "request-initiator");
      const sourceName = String(sourceHandler?.title || "").replace(/\(\)$/, "");
      const sourceIsReadable = sourceName && !["(anonymous)", "anonymous", "n"].includes(sourceName);
      const sourceLocation = locationLabel(sourceHandler?.location || sourceHandler?.frames?.[0]);
      if (sourceIsReadable) {
        overviewParts.push(`${sourceName}() started this request${sourceLocation ? ` from ${sourceLocation}` : ""}.`);
      } else {
        overviewParts.push(`This request followed ${interactionGerund(session)}.`);
      }
      if (importantChange?.text) {
        overviewParts.push(`The trace later observed the page showing “${importantChange.text}”${/[.!?]$/.test(importantChange.text) ? "" : "."}`);
      } else if (requests.length > 1) {
        overviewParts.push(`One of ${requests.length} observed data requests failed.`);
      }
    } else if (requests.length && successfulResponses >= requests.length) {
      overviewParts.push(`${requests.length === 1 ? "The data request" : "All data requests"} completed successfully.`);
    } else if (successfulResponses) {
      overviewParts.push(`${successfulResponses} of ${requests.length} data requests completed successfully.`);
    } else if (requests.length) {
      overviewParts.push(`${requests.length === 1 ? "One data request was" : `${requests.length} data requests were`} observed.`);
    }
    if (mutations.length && !diagnosis) {
      overviewParts.push(`${mutations.length === 1 ? "One page change was" : `${mutations.length} page changes were`} observed.`);
    }
    if (navigations.length) overviewParts.push("The browser address also changed.");
    if (errors.length && !diagnosis) overviewParts.push(`${errors.length === 1 ? "One warning or error was" : `${errors.length} warnings or errors were`} captured.`);
    if (!overviewParts.length) {
      overviewParts.push(`${steps.length} step${steps.length === 1 ? " was" : "s were"} observed from your action to the result.`);
    }

    const hasUnlinkedEvidence = timeline.some((event) => event.kind !== "interaction" && !event.primaryChain);
    const evidenceNote = hasUnlinkedEvidence
      ? "Direct links are supported by browser evidence. Items marked “Observed after interaction” happened in the same short trace window, but the trace could not prove that the interaction caused them."
      : "The main steps are connected by direct browser evidence.";

    return {
      headline,
      overview: overviewParts.join(" "),
      steps,
      evidenceNote
    };
  }

  function compareTraces(before, after) {
    const left = migrateTrace(before);
    const right = migrateTrace(after);
    const countKinds = (trace) => (trace.timeline || []).reduce((counts, event) => {
      counts[event.kind] = (counts[event.kind] || 0) + 1;
      return counts;
    }, {});
    const leftCounts = countKinds(left);
    const rightCounts = countKinds(right);
    const kinds = [...new Set([...Object.keys(leftCounts), ...Object.keys(rightCounts)])].sort();
    const eventChanges = kinds
      .map((kind) => ({ kind, before: leftCounts[kind] || 0, after: rightCounts[kind] || 0 }))
      .filter((item) => item.before !== item.after);
    const requestKeys = (trace) => new Set((trace.timeline || [])
      .filter((event) => event.kind === "request")
      .map((event) => `${requestMethod(event)} ${conciseUrl(requestUrl(event), trace.pageUrl)}`));
    const leftRequests = requestKeys(left);
    const rightRequests = requestKeys(right);
    const addedRequests = [...rightRequests].filter((item) => !leftRequests.has(item));
    const removedRequests = [...leftRequests].filter((item) => !rightRequests.has(item));
    const leftProblems = (left.timeline || []).filter((event) => ["exception", "network-failure"].includes(event.kind) || (event.kind === "response" && responseStatus(event) >= 400)).length;
    const rightProblems = (right.timeline || []).filter((event) => ["exception", "network-failure"].includes(event.kind) || (event.kind === "response" && responseStatus(event) >= 400)).length;
    const qualityBefore = Number(left.quality?.score) || 0;
    const qualityAfter = Number(right.quality?.score) || 0;
    const componentChange = left.framework?.owner === right.framework?.owner
      ? null
      : { before: left.framework?.owner || "Unknown", after: right.framework?.owner || "Unknown" };
    const changed = eventChanges.length + addedRequests.length + removedRequests.length + (componentChange ? 1 : 0);
    return {
      headline: changed
        ? `${changed} comparison signal${changed === 1 ? "" : "s"} changed between the traces`
        : "No meaningful structural differences were found",
      quality: { before: qualityBefore, after: qualityAfter, delta: qualityAfter - qualityBefore },
      problems: { before: leftProblems, after: rightProblems, delta: rightProblems - leftProblems },
      eventChanges,
      addedRequests,
      removedRequests,
      componentChange
    };
  }

  function buildAiInput(session) {
    const { trace } = redactForExport(session);
    const explanation = explain(trace);
    const input = {
      purpose: "Explain this browser interaction to a frontend developer. Separate proven links from observations and suggest at most three concrete checks.",
      page: readableUrl(trace.pageUrl || "", trace.pageUrl || ""),
      interaction: interactionGerund(trace, true),
      deterministicExplanation: explanation,
      framework: trace.framework ? {
        library: trace.framework.library,
        owner: trace.framework.owner,
        context: trace.framework.context
      } : null,
      events: (trace.timeline || []).slice(0, 40).map((event) => ({
        atMs: event.atMs,
        kind: event.kind,
        title: shorten(event.title, 160),
        detail: shorten(event.detail, 180),
        relation: event.primaryChain ? "direct-chain" : "observed"
      })),
      instruction: "Do not invent values, source code, causes, or fixes that are not supported by this input."
    };
    return JSON.stringify(input, null, 2);
  }

  function cleanReportText(value, limit = 1200) {
    return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, limit);
  }

  function reportStep(step, index) {
    const element = step.element || {};
    const subject = cleanReportText(element.text || element.selector || element.tagName || "the page", 120).replace(/\s+/g, " ");
    const selector = cleanReportText(element.selector, 240).replace(/\s+/g, " ");
    const suffix = selector && selector !== subject ? ` (${selector})` : "";
    const key = step.metadata?.key;
    const descriptions = {
      click: `Click “${subject}”${suffix}.`,
      keydown: key && key !== "Character key"
        ? `Press ${key} on “${subject}”${suffix}.`
        : `Use the keyboard on “${subject}”${suffix}. The typed value was intentionally not captured.`,
      change: `Change “${subject}”${suffix}. The entered value was intentionally not captured.`,
      submit: `Submit “${subject}”${suffix}.`,
      drop: `Drop content on “${subject}”${suffix}. The dropped content was intentionally not captured.`
    };
    return {
      number: index + 1,
      eventType: step.eventType || "interaction",
      selector,
      instruction: descriptions[step.eventType] || `Interact with “${subject}”${suffix}.`
    };
  }

  function buildBugReport(session, input = {}) {
    const traceExport = redactForExport(session);
    const detailExport = redactForExport({
      reportDetails: {
        title: cleanReportText(input.title, 120),
        expected: cleanReportText(input.expected, 1600),
        actual: cleanReportText(input.actual, 1600),
        notes: cleanReportText(input.notes, 1600)
      }
    });
    const trace = traceExport.trace || {};
    const details = detailExport.trace.reportDetails || {};
    const redactionReport = Object.fromEntries(Object.keys(traceExport.report).map((key) => [
      key,
      (traceExport.report[key] || 0) + (detailExport.report[key] || 0)
    ]));
    const totalRedactions = traceExport.totalRedactions + detailExport.totalRedactions;
    const explanation = explain(trace);
    const rawSteps = Array.isArray(trace.multiSteps) && trace.multiSteps.length
      ? trace.multiSteps
      : trace.interaction ? [trace.interaction] : [];
    const problems = (trace.timeline || [])
      .filter((event) => event.kind === "exception" || event.kind === "network-failure" || (event.kind === "response" && Number(event.status) >= 400))
      .slice(0, 8)
      .map((event) => ({
        kind: event.kind,
        title: cleanReportText(event.title, 240),
        detail: cleanReportText(event.detail, 320),
        atMs: Number(event.atMs) || 0
      }));
    const report = {
      schemaVersion: 1,
      title: details.title || cleanReportText(explanation.headline, 120) || "Observed browser behaviour",
      page: cleanReportText(trace.pageUrl, 1000) || "Unknown page",
      capturedAt: new Date(trace.startedAt || Date.now()).toISOString(),
      environment: trace.environment || null,
      stepsToReproduce: rawSteps.slice(0, 30).map(reportStep),
      expectedResult: details.expected || "Not specified",
      actualResult: details.actual || cleanReportText(explanation.headline, 1600) || "See observed evidence below.",
      reporterNotes: details.notes || "",
      diagnosis: {
        headline: cleanReportText(explanation.headline, 600),
        overview: cleanReportText(explanation.overview, 1600),
        evidenceNote: cleanReportText(explanation.evidenceNote, 1000)
      },
      observedProblems: problems,
      traceQuality: trace.quality || null,
      technicalSummary: cleanReportText(trace.summary, 2000),
      privacy: {
        redactionsApplied: totalRedactions,
        notice: "Generated locally. Common secrets, credentials, email addresses, sensitive URL parameters, and DOM values were redacted. Review before sharing."
      }
    };
    return {
      report,
      markdown: bugReportMarkdown(report),
      redactionReport,
      totalRedactions
    };
  }

  function bugReportMarkdown(report) {
    const safe = (value) => cleanReportText(value, 4000);
    const lines = [
      `# ${safe(report.title)}`,
      "",
      "## Context",
      "",
      `- Page: ${safe(report.page)}`,
      `- Captured: ${safe(report.capturedAt)}`
    ];
    if (report.environment) {
      const viewport = report.environment.viewport
        ? `${report.environment.viewport.width}×${report.environment.viewport.height}`
        : "Unknown";
      lines.push(`- Browser: ${safe(report.environment.browser || report.environment.userAgent || "Unknown")}`);
      lines.push(`- Viewport: ${viewport}`);
    }
    lines.push("", "## Steps to reproduce", "");
    if (report.stepsToReproduce.length) {
      for (const step of report.stepsToReproduce) lines.push(`${step.number}. ${safe(step.instruction)}`);
    } else {
      lines.push("1. No interaction steps were captured.");
    }
    lines.push(
      "",
      "## Expected result",
      "",
      safe(report.expectedResult),
      "",
      "## Actual result",
      "",
      safe(report.actualResult),
      "",
      "## ReproLens diagnosis",
      "",
      safe(report.diagnosis.headline),
      "",
      safe(report.diagnosis.overview)
    );
    if (report.observedProblems.length) {
      lines.push("", "### Observed problems", "");
      for (const problem of report.observedProblems) {
        lines.push(`- **+${problem.atMs}ms · ${safe(problem.kind)}:** ${safe(problem.title)}${problem.detail ? ` — ${safe(problem.detail)}` : ""}`);
      }
    }
    if (report.reporterNotes) lines.push("", "## Reporter notes", "", safe(report.reporterNotes));
    lines.push(
      "",
      "## Evidence quality",
      "",
      `- Trace quality: ${report.traceQuality?.score ?? 0}% (${safe(report.traceQuality?.label || "unknown")})`,
      `- ${safe(report.technicalSummary || "No technical summary available.")}`,
      "",
      "---",
      "",
      `${safe(report.privacy.notice)} Redactions applied: ${report.privacy.redactionsApplied}.`
    );
    return `${lines.join("\n")}\n`;
  }

  function parseGitHubRepository(value) {
    const repository = cleanReportText(value, 160).replace(/^https:\/\/github\.com\//i, "").replace(/\/$/, "");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.split("/").some((part) => part.startsWith(".") || part.endsWith("."))) {
      return null;
    }
    return repository;
  }

  function buildGitHubIssueUrl(repositoryInput, report) {
    const repository = parseGitHubRepository(repositoryInput);
    if (!repository) throw new Error("Use the format owner/repository, for example acme/web-app.");
    const body = bugReportMarkdown(report);
    const maxBodyLength = 6500;
    const truncated = body.length > maxBodyLength;
    const issueBody = truncated
      ? `${body.slice(0, maxBodyLength)}\n\n_The report was shortened for the GitHub URL. Attach the downloaded Markdown or JSON report for the complete evidence._\n`
      : body;
    return {
      repository,
      truncated,
      url: `https://github.com/${repository}/issues/new?title=${encodeURIComponent(report.title)}&body=${encodeURIComponent(issueBody)}`
    };
  }

  function playwrightPageUrl(value) {
    try {
      const url = new URL(value);
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (/token|key|secret|password|passcode|auth|session|code/i.test(key)) url.searchParams.delete(key);
      }
      return url.toString();
    } catch (_) {
      return "https://example.test/replace-with-page-url";
    }
  }

  function buildPlaywrightTest(session, input = {}) {
    const { trace } = redactForExport(session);
    const report = buildBugReport(trace, input).report;
    const rawSteps = Array.isArray(trace.multiSteps) && trace.multiSteps.length
      ? trace.multiSteps
      : trace.interaction ? [trace.interaction] : [];
    const lines = [
      'import { test, expect } from "@playwright/test";',
      "",
      `test(${JSON.stringify(report.title)}, async ({ page }) => {`,
      `  await page.goto(${JSON.stringify(playwrightPageUrl(trace.pageUrl))});`
    ];
    rawSteps.slice(0, 30).forEach((step, index) => {
      const selector = step.element?.selector || "REPLACE_WITH_SELECTOR";
      const locator = `page.locator(${JSON.stringify(selector)})`;
      const instruction = reportStep(step, index).instruction.replace(/[\r\n]+/g, " ");
      lines.push("", `  // Step ${index + 1}: ${instruction}`);
      if (step.eventType === "click") {
        lines.push(`  await ${locator}.click();`);
      } else if (step.eventType === "keydown" && step.metadata?.key && step.metadata.key !== "Character key") {
        lines.push(`  await ${locator}.press(${JSON.stringify(step.metadata.key)});`);
      } else if (step.eventType === "change") {
        lines.push(`  await ${locator}.fill("REPLACE_WITH_TEST_VALUE");`);
      } else if (step.eventType === "submit") {
        lines.push(`  await ${locator}.click();`);
      } else {
        lines.push("  // TODO: Recreate this privacy-sensitive interaction with non-production test data.");
      }
    });
    const finalTextMutation = [...(trace.mutations || [])].reverse().find((mutation) => /Text changed to “.+”/.test(mutation.summary || ""));
    const expectedText = finalTextMutation?.summary?.match(/Text changed to “(.+)”/)?.[1];
    lines.push("");
    if (expectedText && finalTextMutation.target) {
      lines.push(`  await expect(page.locator(${JSON.stringify(finalTextMutation.target)})).toContainText(${JSON.stringify(expectedText)});`);
    } else if ((report.observedProblems || []).length) {
      lines.push("  // TODO: Replace with the user-visible result that should confirm the bug is fixed.");
      lines.push("  await expect(page).toHaveURL(/.*/);");
    } else {
      lines.push("  // TODO: Add an assertion for the expected user-visible result.");
      lines.push("  await expect(page).toHaveURL(/.*/);");
    }
    lines.push("});", "");
    return lines.join("\n");
  }

  function assessQuality(session) {
    const timeline = session.timeline?.length ? session.timeline : buildTimeline(session);
    const observed = timeline.filter((event) => event.kind !== "interaction");
    const requests = timeline.filter((event) => event.kind === "request");
    const responses = timeline.filter((event) => event.kind === "response");
    const checks = [
      { id: "interaction", passed: Boolean(session.interaction || session.multiSteps?.length), label: "Interaction captured" },
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
    if (session.timerCapture?.relatedTargetCapture?.available === false) {
      diagnostics.push("Deeper Worker and cross-origin frame tracing requires Chrome 125 or newer");
    }
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
    buildAiInput,
    buildBugReport,
    buildGitHubIssueUrl,
    buildPlaywrightTest,
    bugReportMarkdown,
    compactFrame,
    confidenceFor,
    confidenceLabel,
    compareTraces,
    eventCategory,
    explain,
    filterTimeline,
    limitHistory,
    markdownReport,
    markPrimaryChain,
    migrateTrace,
    networkScope,
    parseBrowserStack,
    parseGitHubRepository,
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
