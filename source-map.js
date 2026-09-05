(function exposeSourceMapResolver(root) {
  function scriptIdFor(frame) {
    return frame.location?.scriptId || frame.scriptId || "";
  }

  function generatedPosition(frame) {
    const nested = frame.location || {};
    const rawLine = Number.isFinite(nested.lineNumber) ? nested.lineNumber : frame.lineNumber;
    const rawColumn = Number.isFinite(nested.columnNumber) ? nested.columnNumber : frame.columnNumber;
    if (!Number.isFinite(rawLine) || !Number.isFinite(rawColumn)) return null;
    return { line: rawLine + 1, column: rawColumn };
  }

  function mapUrlFor(script) {
    if (!script?.url || !script?.sourceMapURL) return null;
    if (script.sourceMapURL.startsWith("data:")) return script.sourceMapURL;
    try {
      return new URL(script.sourceMapURL, script.url).href;
    } catch (_) {
      return null;
    }
  }

  function originalUrlFor(source, mapUrl) {
    if (!source || source.includes("://") || source.startsWith("webpack:")) return source || "";
    try {
      return new URL(source, mapUrl).href;
    } catch (_) {
      return source;
    }
  }

  async function defaultFetchMap(url) {
    if (url.startsWith("data:")) {
      const comma = url.indexOf(",");
      const metadata = url.slice(0, comma);
      const payload = url.slice(comma + 1);
      const text = metadata.includes(";base64") ? atob(payload) : decodeURIComponent(payload);
      return JSON.parse(text);
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Source map fetch failed with HTTP ${response.status}`);
    return response.json();
  }

  function allFrames(session) {
    function asyncStackFrames(stack) {
      const frames = [];
      let current = stack;
      while (current) {
        frames.push(...(current.callFrames || []));
        current = current.parent;
      }
      return frames;
    }

    return [
      ...(session.handlers || []).flatMap((handler) => handler.callFrames || []),
      ...(session.network || []).flatMap((item) => [
        ...(item.initiatorCallFrames || []),
        ...asyncStackFrames(item.initiatorAsyncStack)
      ]),
      ...(session.asyncEvents || []).flatMap((event) => [
        ...(event.callFrames || []),
        ...asyncStackFrames(event.asyncStackTrace)
      ])
    ];
  }

  async function enrichSession(session, options = {}) {
    if (!root.TraceMapping) return { mappedFrames: 0, errors: ["TraceMapping library unavailable"] };
    const fetchMap = options.fetchMap || defaultFetchMap;
    const cache = new Map();
    const errors = [];
    let mappedFrames = 0;

    for (const frame of allFrames(session)) {
      const script = session.scripts?.[scriptIdFor(frame)]
        || Object.values(session.scripts || {}).find((candidate) => candidate.url && candidate.url === frame.url);
      if (!frame.url && script?.url) frame.url = script.url;
      const mapUrl = mapUrlFor(script);
      const position = generatedPosition(frame);
      if (!mapUrl || !position) continue;

      try {
        if (!cache.has(mapUrl)) {
          cache.set(mapUrl, Promise.resolve(fetchMap(mapUrl)).then((map) => new root.TraceMapping.TraceMap(map)));
        }
        const traceMap = await cache.get(mapUrl);
        const original = root.TraceMapping.originalPositionFor(traceMap, position);
        if (!original?.source || !original.line) continue;
        frame.originalLocation = {
          source: original.source,
          url: originalUrlFor(original.source, mapUrl),
          lineNumber: original.line,
          columnNumber: Number.isFinite(original.column) ? original.column + 1 : null,
          name: original.name || frame.functionName || ""
        };
        mappedFrames += 1;
      } catch (error) {
        errors.push(`${mapUrl}: ${error.message || String(error)}`);
      }
    }

    session.sourceMaps = {
      attempted: cache.size,
      mappedFrames,
      errors: [...new Set(errors)]
    };
    return session.sourceMaps;
  }

  const api = { enrichSession, generatedPosition, mapUrlFor };
  root.SourceMapResolver = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
