importScripts("trace-core.js", "vendor/trace-mapping.js", "source-map.js", "framework-adapter.js");

const sessions = new Map();
const TRACE_WINDOW_MS = 3500;
const TIMER_STORE_KEY = "__behaviourTracerAsyncStore_v020";
const HISTORY_LIMIT = 25;

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

function blankSession(tabId) {
  return {
    schemaVersion: 1,
    tabId,
    status: "idle",
    selectedElement: null,
    pageUrl: "",
    framework: null,
    startedAt: null,
    interactionAt: null,
    interaction: null,
    handlers: [],
    asyncEvents: [],
    timerCapture: null,
    network: [],
    mutations: [],
    exceptions: [],
    logs: [],
    navigations: [],
    scripts: {},
    sourceMaps: null,
    timeline: [],
    summary: "",
    quality: null,
    error: null
  };
}

function getSession(tabId) {
  if (!sessions.has(tabId)) sessions.set(tabId, blankSession(tabId));
  return sessions.get(tabId);
}

function publicSession(session) {
  return TraceCore.sanitizePublicSession(session);
}

function publish(session) {
  chrome.runtime.sendMessage({
    type: "TRACE_STATE",
    state: publicSession(session)
  }).catch(() => {});
}

async function historySettings() {
  const stored = await chrome.storage.local.get({ historyEnabled: true });
  return { historyEnabled: stored.historyEnabled !== false };
}

async function saveTraceToHistory(session) {
  if (!(await historySettings()).historyEnabled) return;
  const stored = await chrome.storage.local.get({ traceHistory: [] });
  const trace = publicSession(session);
  trace.historyId = `${Date.now()}-${session.tabId}`;
  trace.savedAt = Date.now();
  const traceHistory = [trace, ...stored.traceHistory].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ traceHistory });
}

function command(tabId, method, params = {}) {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

function installTimerHookExpression() {
  function __behaviourTracerInstallTimerHook() {
    const key = "__behaviourTracerAsyncStore_v020";
    const existing = window[key];
    if (existing?.installed) {
      existing.events.length = 0;
      return { installed: true, reused: true };
    }

    const native = {
      setTimeout: window.setTimeout,
      setInterval: window.setInterval,
      requestAnimationFrame: window.requestAnimationFrame
    };
    const store = {
      installed: true,
      events: [],
      native,
      nextTimerId: 1,
      wrappers: {},
      autoRestoreId: null
    };

    function schedule(type, callback, delay) {
      const timerId = store.nextTimerId++;
      store.events.push({
        type,
        phase: "scheduled",
        at: Date.now(),
        timerId,
        delay: Number(delay) || 0,
        callbackName: typeof callback === "function" ? callback.name || "(anonymous)" : "(string callback)",
        stack: new Error().stack || ""
      });

      if (typeof callback !== "function") return { timerId, callback };
      function __behaviourTracerAsyncCallback(...callbackArgs) {
        store.events.push({
          type,
          phase: "callback",
          at: Date.now(),
          timerId,
          callbackName: callback.name || "(anonymous)"
        });
        return Reflect.apply(callback, this, callbackArgs);
      }
      return { timerId, callback: __behaviourTracerAsyncCallback };
    }

    function __behaviourTracerSetTimeout(callback, delay, ...args) {
      const captured = schedule("setTimeout", callback, delay);
      return Reflect.apply(native.setTimeout, this, [captured.callback, delay, ...args]);
    }

    function __behaviourTracerSetInterval(callback, delay, ...args) {
      const captured = schedule("setInterval", callback, delay);
      return Reflect.apply(native.setInterval, this, [captured.callback, delay, ...args]);
    }

    function __behaviourTracerRequestAnimationFrame(callback) {
      const captured = schedule("requestAnimationFrame", callback, 0);
      return Reflect.apply(native.requestAnimationFrame, this, [captured.callback]);
    }

    store.wrappers.setTimeout = __behaviourTracerSetTimeout;
    store.wrappers.setInterval = __behaviourTracerSetInterval;
    if (typeof native.requestAnimationFrame === "function") {
      store.wrappers.requestAnimationFrame = __behaviourTracerRequestAnimationFrame;
    }
    Object.defineProperty(window, key, { configurable: true, value: store });
    for (const [name, wrapper] of Object.entries(store.wrappers)) window[name] = wrapper;
    store.autoRestoreId = Reflect.apply(native.setTimeout, window, [function __behaviourTracerAutoRestore() {
      for (const [name, wrapper] of Object.entries(store.wrappers)) {
        if (window[name] === wrapper) window[name] = store.native[name];
      }
      delete window[key];
    }, 10000]);
    return { installed: true, reused: false };
  }

  return `(${__behaviourTracerInstallTimerHook.toString()})()`;
}

function collectTimerHookExpression() {
  return `(() => {
    const key = ${JSON.stringify(TIMER_STORE_KEY)};
    const store = window[key];
    if (!store?.installed) return [];
    const events = store.events.slice();
    if (store.autoRestoreId != null) window.clearTimeout(store.autoRestoreId);
    for (const [name, wrapper] of Object.entries(store.wrappers || {})) {
      if (window[name] === wrapper) window[name] = store.native[name];
    }
    delete window[key];
    return events;
  })()`;
}

async function installTimerHook(tabId) {
  const response = await command(tabId, "Runtime.evaluate", {
    expression: installTimerHookExpression(),
    returnByValue: true,
    silent: true
  });
  if (response?.exceptionDetails || !response?.result?.value?.installed) {
    throw new Error(response?.exceptionDetails?.text || "Could not install the timer fallback.");
  }
}

async function configureTimerCapture(tabId) {
  const failures = [];
  const eventNames = [
    "setTimeout", "setTimeout.callback",
    "setInterval", "setInterval.callback",
    "requestAnimationFrame", "requestAnimationFrame.callback"
  ];
  for (const domain of ["EventBreakpoints", "DOMDebugger"]) {
    try {
      await Promise.all(eventNames.map((eventName) => command(
        tabId,
        `${domain}.setInstrumentationBreakpoint`,
        { eventName }
      )));
      return { mode: "cdp", domain };
    } catch (error) {
      failures.push(error.message || String(error));
      await Promise.all(eventNames.map((eventName) => command(
        tabId,
        `${domain}.removeInstrumentationBreakpoint`,
        { eventName }
      ).catch(() => {})));
    }
  }

  try {
    await installTimerHook(tabId);
    return { mode: "main-world-hook", fallbackReason: failures[0] || "CDP timer instrumentation unavailable" };
  } catch (error) {
    return {
      mode: "unavailable",
      fallbackReason: [...failures, error.message || String(error)].filter(Boolean).join("; ")
    };
  }
}

async function collectTimerHookEvents(tabId, session) {
  if (session.timerCapture?.mode !== "main-world-hook") return;
  const response = await command(tabId, "Runtime.evaluate", {
    expression: collectTimerHookExpression(),
    returnByValue: true,
    silent: true
  });
  const rawEvents = response?.result?.value;
  if (!Array.isArray(rawEvents)) return;

  const schedules = new Map();
  for (const raw of rawEvents) {
    if (raw.phase === "scheduled") {
      const event = {
        at: raw.at,
        eventName: `hook:${raw.type || "setTimeout"}`,
        timerId: raw.timerId,
        delay: raw.delay,
        callbackName: raw.callbackName,
        captureMode: "main-world-hook",
        callFrames: TraceCore.parseBrowserStack(raw.stack),
        asyncStackTrace: null
      };
      schedules.set(raw.timerId, event);
      session.asyncEvents.push(event);
    } else if (raw.phase === "callback") {
      const schedule = schedules.get(raw.timerId);
      session.asyncEvents.push({
        at: raw.at,
        eventName: `hook:${raw.type || "setTimeout"}.callback`,
        timerId: raw.timerId,
        callbackName: raw.callbackName,
        captureMode: "main-world-hook",
        callFrames: [{ functionName: raw.callbackName || "(anonymous)", url: "" }],
        asyncStackTrace: schedule ? {
          description: raw.type || "setTimeout",
          callFrames: schedule.callFrames
        } : null
      });
    }
  }
}

async function attach(tabId) {
  await chrome.debugger.attach({ tabId }, "1.3");
  await Promise.all([
    command(tabId, "Debugger.enable"),
    command(tabId, "Network.enable"),
    command(tabId, "Page.enable"),
    command(tabId, "Runtime.enable"),
    command(tabId, "Log.enable")
  ]);
  await command(tabId, "Debugger.setAsyncCallStackDepth", { maxDepth: 32 }).catch(() => {});
  await command(tabId, "DOMDebugger.setEventListenerBreakpoint", {
    eventName: "click"
  });
  return configureTimerCapture(tabId);
}

async function inspectFramework(tabId, selector) {
  if (!selector) return null;
  const response = await command(tabId, "Runtime.evaluate", {
    expression: FrameworkAdapter.buildInspectionExpression(selector),
    returnByValue: true,
    silent: true
  });
  if (response?.exceptionDetails) return null;
  return response?.result?.value || null;
}

async function detach(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {
    // The page may already have closed or navigated.
  }
}

async function startTrace(tabId, traceWindowMs = TRACE_WINDOW_MS) {
  const previous = getSession(tabId);
  if (previous.status === "recording" || previous.status === "armed") {
    throw new Error("A trace is already running in this tab.");
  }

  const session = blankSession(tabId);
  session.traceWindowMs = Math.max(500, Math.min(Number(traceWindowMs) || TRACE_WINDOW_MS, TRACE_WINDOW_MS));
  session.selectedElement = previous.selectedElement;
  session.status = "attaching";
  session.startedAt = Date.now();
  session.pageUrl = (await chrome.tabs.get(tabId)).url || "";
  sessions.set(tabId, session);
  publish(session);

  try {
    session.timerCapture = await attach(tabId);
    session.framework = await inspectFramework(tabId, session.selectedElement?.selector).catch(() => null);
    session.status = "armed";
    await chrome.tabs.sendMessage(tabId, {
      type: "ARM_INTERACTION",
      captureMs: Math.max(300, session.traceWindowMs - 200)
    });
    publish(session);
    return publicSession(session);
  } catch (error) {
    session.status = "error";
    session.error = error.message || String(error);
    await collectTimerHookEvents(tabId, session).catch(() => {});
    await detach(tabId);
    publish(session);
    throw error;
  }
}

async function finishTrace(tabId) {
  const session = getSession(tabId);
  if (!["armed", "recording", "attaching"].includes(session.status)) return;
  session.status = "processing";
  publish(session);
  await collectTimerHookEvents(tabId, session).catch((error) => {
    session.timerCapture = {
      ...session.timerCapture,
      collectionError: error.message || String(error)
    };
  });
  await detach(tabId);
  await SourceMapResolver.enrichSession(session);
  session.timeline = TraceCore.buildTimeline(session);
  session.summary = TraceCore.summarize(session);
  session.quality = TraceCore.assessQuality(session);
  session.status = "complete";
  publish(session);
  saveTraceToHistory(session).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || sender.tab?.id;

  if (message.type === "GET_STATE") {
    sendResponse(publicSession(getSession(tabId)));
    return false;
  }

  if (message.type === "ELEMENT_SELECTED") {
    const session = getSession(tabId);
    session.selectedElement = message.element;
    session.status = session.status === "idle" ? "selected" : session.status;
    publish(session);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "START_TRACE") {
    startTrace(tabId, message.traceWindowMs)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message.type === "CANCEL_TRACE") {
    finishTrace(tabId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "GET_HISTORY") {
    Promise.all([
      chrome.storage.local.get({ traceHistory: [] }),
      historySettings()
    ]).then(([stored, settings]) => sendResponse({ ...settings, traces: stored.traceHistory }));
    return true;
  }

  if (message.type === "SET_HISTORY_ENABLED") {
    chrome.storage.local.set({ historyEnabled: Boolean(message.enabled) })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "DELETE_HISTORY_TRACE") {
    chrome.storage.local.get({ traceHistory: [] }).then(({ traceHistory }) => {
      const traces = traceHistory.filter((trace) => trace.historyId !== message.historyId);
      return chrome.storage.local.set({ traceHistory: traces });
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "CLEAR_HISTORY") {
    chrome.storage.local.set({ traceHistory: [] }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "IMPORT_TRACE") {
    const validation = TraceCore.validateImportedTrace(message.trace);
    if (!validation.ok) {
      sendResponse({ ok: false, error: validation.error });
      return false;
    }
    chrome.storage.local.get({ traceHistory: [] }).then(({ traceHistory }) => {
      const trace = TraceCore.sanitizePublicSession(message.trace);
      trace.historyId = `import-${Date.now()}`;
      trace.savedAt = Date.now();
      return chrome.storage.local.set({ traceHistory: [trace, ...traceHistory].slice(0, HISTORY_LIMIT) });
    }).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "INTERACTION_START") {
    const session = getSession(tabId);
    if (!["armed", "recording"].includes(session.status)) return false;
    session.status = "recording";
    session.interactionAt = message.at || Date.now();
    session.interaction = {
      eventType: message.eventType,
      element: message.element
    };
    publish(session);
    setTimeout(() => finishTrace(tabId), session.traceWindowMs || TRACE_WINDOW_MS);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "DOM_MUTATIONS") {
    const session = getSession(tabId);
    if (["recording", "processing"].includes(session.status)) {
      session.mutations.push(...message.mutations);
      publish(session);
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.debugger.onEvent.addListener(async (source, method, params) => {
  const tabId = source.tabId;
  const session = sessions.get(tabId);
  if (!session || !["attaching", "armed", "recording", "processing"].includes(session.status)) {
    if (method === "Debugger.paused") await command(tabId, "Debugger.resume").catch(() => {});
    return;
  }

  const at = Date.now();

  if (method === "Debugger.scriptParsed") {
    session.scripts[params.scriptId] = {
      url: params.url || "",
      sourceMapURL: params.sourceMapURL || ""
    };
    return;
  }

  if (method === "Debugger.paused") {
    const eventName = params.data?.eventName || "";
    if (["setTimeout", "setInterval", "requestAnimationFrame"].some((name) => eventName.startsWith(`instrumentation:${name}`))) {
      const asyncEvent = {
        at,
        eventName,
        captureMode: "cdp",
        callFrames: params.callFrames || [],
        asyncStackTrace: params.asyncStackTrace || null
      };
      if (TraceCore.asyncEventFrames(asyncEvent, 10).length) {
        session.asyncEvents.push(asyncEvent);
        publish(session);
      }
    } else if (params.reason === "EventListener" || eventName.includes("click")) {
      const frames = TraceCore.usefulFrames(params.callFrames || [], 5);
      if (frames.length) {
        session.handlers.push({
          at,
          eventName: eventName || "click",
          callFrames: params.callFrames || []
        });
        publish(session);
      }
    }
    await command(tabId, "Debugger.resume").catch(() => {});
    return;
  }

  if (method === "Network.requestWillBeSent") {
    session.network.push({
      phase: "request",
      at,
      requestId: params.requestId,
      method: params.request?.method,
      url: params.request?.url,
      type: params.type,
      initiator: params.initiator?.type,
      initiatorCallFrames: params.initiator?.stack?.callFrames || []
    });
  } else if (method === "Network.responseReceived") {
    session.network.push({
      phase: "response",
      at,
      requestId: params.requestId,
      status: params.response?.status,
      url: params.response?.url,
      type: params.type
    });
  } else if (method === "Network.loadingFailed") {
    session.network.push({
      phase: "failure",
      at,
      requestId: params.requestId,
      errorText: params.errorText || "Request failed",
      canceled: Boolean(params.canceled),
      type: params.type
    });
  } else if (method === "Runtime.exceptionThrown") {
    session.exceptions.push({
      at,
      text: params.exceptionDetails?.text,
      url: params.exceptionDetails?.url,
      lineNumber: params.exceptionDetails?.lineNumber
    });
  } else if (method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(params.type)) {
    session.logs.push({
      at,
      level: params.type,
      text: (params.args || []).map((arg) => arg.value ?? arg.description ?? arg.type).join(" "),
      url: params.stackTrace?.callFrames?.[0]?.url || ""
    });
  } else if (method === "Log.entryAdded" && ["error", "warning"].includes(params.entry?.level)) {
    session.logs.push({
      at,
      level: params.entry.level,
      text: params.entry.text,
      url: params.entry.url || ""
    });
  } else if (method === "Page.frameNavigated" && !params.frame?.parentId) {
    session.navigations.push({
      at,
      url: params.frame?.url,
      name: params.frame?.name
    });
  } else if (method === "Page.navigatedWithinDocument") {
    session.navigations.push({
      at,
      url: params.url,
      name: params.navigationType || "same-document"
    });
  }

  if (method.startsWith("Network.") || method === "Runtime.exceptionThrown" || method === "Runtime.consoleAPICalled" || method === "Log.entryAdded" || method === "Page.frameNavigated" || method === "Page.navigatedWithinDocument") {
    publish(session);
  }
});

chrome.debugger.onDetach.addListener(async (source, reason) => {
  const session = sessions.get(source.tabId);
  if (!session || ["complete", "idle", "selected", "processing"].includes(session.status)) return;
  session.status = "processing";
  publish(session);
  await SourceMapResolver.enrichSession(session);
  session.timeline = TraceCore.buildTimeline(session);
  session.summary = TraceCore.summarize(session);
  session.quality = TraceCore.assessQuality(session);
  session.status = "complete";
  if (reason !== "target_closed" && reason !== "canceled_by_user") {
    session.error = `Debugger detached: ${reason}`;
  }
  publish(session);
  saveTraceToHistory(session).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => sessions.delete(tabId));
