importScripts("trace-core.js", "vendor/trace-mapping.js", "source-map.js", "framework-adapter.js");

const sessions = new Map();
const TRACE_WINDOW_MS = 3500;
const TIMER_STORE_KEY = "__behaviourTracerAsyncStore_v020";
const HISTORY_LIMIT = 25;
const HISTORY_BYTE_LIMIT = 5_000_000;
const SESSION_KEY_PREFIX = "traceState:";

async function configureSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (_) {
    // Chrome can briefly reject this while an extension update is settling.
  }
}

void configureSidePanel();

function blankSession(tabId) {
  return {
    schemaVersion: 2,
    traceId: crypto.randomUUID(),
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
    workerEvents: [],
    timerCapture: null,
    network: [],
    webSockets: [],
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

function sessionStorageKey(tabId) {
  return `${SESSION_KEY_PREFIX}${tabId}`;
}

async function storedSession(tabId) {
  if (!tabId) return null;
  const key = sessionStorageKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return stored[key] || null;
}

async function visibleSession(tabId) {
  return sessions.has(tabId)
    ? publicSession(sessions.get(tabId))
    : (await storedSession(tabId)) || publicSession(blankSession(tabId));
}

async function publishState(session) {
  const state = publicSession(session);
  if (["idle", "selected", "complete", "error"].includes(state.status)) {
    try {
      await chrome.storage.session.set({ [sessionStorageKey(session.tabId)]: state });
    } catch (_) {
      // A transient storage failure must not interrupt an active debugger session.
    }
  }
  try {
    await chrome.runtime.sendMessage({ type: "TRACE_STATE", state });
  } catch (_) {
    // The side panel is optional and is commonly closed while capture continues.
  }
}

function publish(session) {
  void publishState(session);
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
  const traceHistory = TraceCore.limitHistory(
    [trace, ...stored.traceHistory],
    HISTORY_LIMIT,
    HISTORY_BYTE_LIMIT
  ).traces;
  await chrome.storage.local.set({ traceHistory });
}

function command(tabId, method, params = {}) {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

function installTimerHookExpression(captureTimers = true) {
  function __behaviourTracerInstallTimerHook(captureTimers) {
    const key = "__behaviourTracerAsyncStore_v020";
    const existing = window[key];
    if (existing?.installed) {
      existing.events.length = 0;
      return { installed: true, reused: true };
    }

    const native = {
      setTimeout: window.setTimeout,
      setInterval: window.setInterval,
      requestAnimationFrame: window.requestAnimationFrame,
      queueMicrotask: window.queueMicrotask,
      promiseThen: window.Promise?.prototype?.then,
      Worker: window.Worker
    };
    const store = {
      installed: true,
      events: [],
      native,
      nextTimerId: 1,
      nextWorkerId: 1,
      wrappers: {},
      workerRestores: [],
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

    function __behaviourTracerQueueMicrotask(callback) {
      const captured = schedule("queueMicrotask", callback, 0);
      return Reflect.apply(native.queueMicrotask, this, [captured.callback]);
    }

    function __behaviourTracerPromiseThen(onFulfilled, onRejected) {
      const fulfilled = typeof onFulfilled === "function" ? schedule("Promise", onFulfilled, 0).callback : onFulfilled;
      const rejected = typeof onRejected === "function" ? schedule("Promise", onRejected, 0).callback : onRejected;
      return Reflect.apply(native.promiseThen, this, [fulfilled, rejected]);
    }

    function __behaviourTracerWorker(url, options) {
      const workerId = store.nextWorkerId++;
      store.events.push({ type: "Worker", phase: "created", at: Date.now(), workerId, url: String(url), stack: new Error().stack || "" });
      const worker = Reflect.construct(native.Worker, options === undefined ? [url] : [url, options]);
      const nativePostMessage = worker.postMessage;
      function __behaviourTracerWorkerPostMessage(...args) {
        store.events.push({ type: "Worker", phase: "sent", at: Date.now(), workerId });
        return Reflect.apply(nativePostMessage, worker, args);
      }
      function __behaviourTracerWorkerMessage() {
        store.events.push({ type: "Worker", phase: "received", at: Date.now(), workerId });
      }
      function __behaviourTracerWorkerError() {
        store.events.push({ type: "Worker", phase: "error", at: Date.now(), workerId });
      }
      worker.postMessage = __behaviourTracerWorkerPostMessage;
      worker.addEventListener("message", __behaviourTracerWorkerMessage);
      worker.addEventListener("error", __behaviourTracerWorkerError);
      store.workerRestores.push(() => {
        if (worker.postMessage === __behaviourTracerWorkerPostMessage) worker.postMessage = nativePostMessage;
        worker.removeEventListener("message", __behaviourTracerWorkerMessage);
        worker.removeEventListener("error", __behaviourTracerWorkerError);
      });
      return worker;
    }

    if (captureTimers) {
      store.wrappers.setTimeout = __behaviourTracerSetTimeout;
      store.wrappers.setInterval = __behaviourTracerSetInterval;
      if (typeof native.requestAnimationFrame === "function") {
        store.wrappers.requestAnimationFrame = __behaviourTracerRequestAnimationFrame;
      }
    }
    if (typeof native.queueMicrotask === "function") store.wrappers.queueMicrotask = __behaviourTracerQueueMicrotask;
    if (typeof native.promiseThen === "function") window.Promise.prototype.then = __behaviourTracerPromiseThen;
    if (typeof native.Worker === "function") {
      __behaviourTracerWorker.prototype = native.Worker.prototype;
      Object.setPrototypeOf(__behaviourTracerWorker, native.Worker);
      store.wrappers.Worker = __behaviourTracerWorker;
    }
    Object.defineProperty(window, key, { configurable: true, value: store });
    for (const [name, wrapper] of Object.entries(store.wrappers)) window[name] = wrapper;
    store.autoRestoreId = Reflect.apply(native.setTimeout, window, [function __behaviourTracerAutoRestore() {
      for (const [name, wrapper] of Object.entries(store.wrappers)) {
        if (window[name] === wrapper) window[name] = store.native[name];
      }
      if (window.Promise?.prototype?.then === __behaviourTracerPromiseThen) window.Promise.prototype.then = store.native.promiseThen;
      for (const restore of store.workerRestores) restore();
      delete window[key];
    }, 10000]);
    return { installed: true, reused: false };
  }

  return `(${__behaviourTracerInstallTimerHook.toString()})(${JSON.stringify(captureTimers)})`;
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
    if (window.Promise?.prototype?.then?.name === "__behaviourTracerPromiseThen") {
      window.Promise.prototype.then = store.native.promiseThen;
    }
    for (const restore of store.workerRestores || []) restore();
    delete window[key];
    return events;
  })()`;
}

async function installTimerHook(tabId, captureTimers = true) {
  const response = await command(tabId, "Runtime.evaluate", {
    expression: installTimerHookExpression(captureTimers),
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
      await installTimerHook(tabId, false);
      return { mode: "cdp+main-world-hook", domain };
    } catch (error) {
      failures.push(error.message || String(error));
      await Promise.all(eventNames.map(async (eventName) => {
        try {
          await command(tabId, `${domain}.removeInstrumentationBreakpoint`, { eventName });
        } catch (_) {
          // Unsupported breakpoint domains can also reject their matching removal calls.
        }
      }));
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
  if (!session.timerCapture?.mode?.includes("main-world-hook")) return;
  const response = await command(tabId, "Runtime.evaluate", {
    expression: collectTimerHookExpression(),
    returnByValue: true,
    silent: true
  });
  const rawEvents = response?.result?.value;
  if (!Array.isArray(rawEvents)) return;

  const schedules = new Map();
  for (const raw of rawEvents) {
    if (raw.type === "Worker") {
      session.workerEvents.push({
        at: raw.at,
        phase: raw.phase,
        workerId: raw.workerId,
        url: raw.url || "",
        callFrames: raw.stack ? TraceCore.parseBrowserStack(raw.stack) : []
      });
    } else if (raw.phase === "scheduled") {
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
  try {
    await command(tabId, "Debugger.setAsyncCallStackDepth", { maxDepth: 32 });
  } catch (_) {
    // Async stack depth is an enhancement and is not supported by every target.
  }
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
  const previous = sessions.get(tabId) || (await storedSession(tabId)) || blankSession(tabId);
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
    try {
      session.framework = await inspectFramework(tabId, session.selectedElement?.selector);
    } catch (_) {
      session.framework = null;
    }
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
    try {
      await collectTimerHookEvents(tabId, session);
    } catch (_) {
      // Preserve the original startup error.
    }
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
  try {
    await collectTimerHookEvents(tabId, session);
  } catch (error) {
    session.timerCapture = {
      ...session.timerCapture,
      collectionError: error.message || String(error)
    };
  }
  await detach(tabId);
  await SourceMapResolver.enrichSession(session);
  session.timeline = TraceCore.buildTimeline(session);
  session.summary = TraceCore.summarize(session);
  session.quality = TraceCore.assessQuality(session);
  session.status = "complete";
  publish(session);
  try {
    await saveTraceToHistory(session);
  } catch (_) {
    // The completed trace remains available in session storage and the side panel.
  }
}

async function finishTraceSafely(tabId) {
  try {
    await finishTrace(tabId);
  } catch (error) {
    const session = getSession(tabId);
    session.status = "error";
    session.error = error.message || String(error);
    await detach(tabId);
    publish(session);
  }
}

async function handleMessage(message, sender) {
  const tabId = message.tabId || sender.tab?.id;

  if (message.type === "GET_STATE") return visibleSession(tabId);

  if (message.type === "ELEMENT_SELECTED") {
    const session = getSession(tabId);
    session.selectedElement = message.element;
    session.status = session.status === "idle" ? "selected" : session.status;
    publish(session);
    return { ok: true };
  }

  if (message.type === "START_TRACE") {
    return { ok: true, state: await startTrace(tabId, message.traceWindowMs) };
  }

  if (message.type === "CANCEL_TRACE") {
    await finishTrace(tabId);
    return { ok: true };
  }

  if (message.type === "GET_HISTORY") {
    const [stored, settings] = await Promise.all([
      chrome.storage.local.get({ traceHistory: [] }),
      historySettings()
    ]);
    const migrated = stored.traceHistory.map((trace) => {
      try { return TraceCore.migrateTrace(trace); } catch (_) { return null; }
    }).filter(Boolean);
    const bounded = TraceCore.limitHistory(migrated, HISTORY_LIMIT, HISTORY_BYTE_LIMIT);
    return {
      ...settings,
      traces: bounded.traces,
      historyBytes: bounded.bytes,
      historyByteLimit: HISTORY_BYTE_LIMIT
    };
  }

  if (message.type === "SET_HISTORY_ENABLED") {
    await chrome.storage.local.set({ historyEnabled: Boolean(message.enabled) });
    return { ok: true };
  }

  if (message.type === "DELETE_HISTORY_TRACE") {
    const { traceHistory } = await chrome.storage.local.get({ traceHistory: [] });
    const traces = traceHistory.filter((trace) => trace.historyId !== message.historyId);
    await chrome.storage.local.set({ traceHistory: traces });
    return { ok: true };
  }

  if (message.type === "CLEAR_HISTORY") {
    await chrome.storage.local.set({ traceHistory: [] });
    return { ok: true };
  }

  if (message.type === "IMPORT_TRACE") {
    const validation = TraceCore.validateImportedTrace(message.trace);
    if (!validation.ok) return { ok: false, error: validation.error };
    const { traceHistory } = await chrome.storage.local.get({ traceHistory: [] });
    const trace = TraceCore.sanitizePublicSession(TraceCore.migrateTrace(message.trace));
    trace.historyId = `import-${Date.now()}`;
    trace.savedAt = Date.now();
    const bounded = TraceCore.limitHistory([trace, ...traceHistory], HISTORY_LIMIT, HISTORY_BYTE_LIMIT);
    if (!bounded.traces.some((item) => item.historyId === trace.historyId)) {
      throw new Error("Imported trace exceeds the local history size budget.");
    }
    await chrome.storage.local.set({ traceHistory: bounded.traces });
    return { ok: true };
  }

  if (message.type === "INTERACTION_START") {
    const session = getSession(tabId);
    if (!["armed", "recording"].includes(session.status)) {
      return { ok: false, error: "No trace is armed for this tab." };
    }
    session.status = "recording";
    session.interactionAt = message.at || Date.now();
    session.interaction = {
      eventType: message.eventType,
      element: message.element
    };
    publish(session);
    setTimeout(() => { void finishTraceSafely(tabId); }, session.traceWindowMs || TRACE_WINDOW_MS);
    return { ok: true };
  }

  if (message.type === "DOM_MUTATIONS") {
    const session = getSession(tabId);
    if (["recording", "processing"].includes(session.status)) {
      session.mutations.push(...message.mutations);
      publish(session);
    }
    return { ok: true };
  }

  return { ok: false, error: "Unknown extension message." };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  async function respond() {
    try {
      sendResponse(await handleMessage(message, sender));
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
  }
  void respond();
  return true;
});

chrome.debugger.onEvent.addListener(async (source, method, params) => {
  const tabId = source.tabId;
  const session = sessions.get(tabId);
  if (!session || !["attaching", "armed", "recording", "processing"].includes(session.status)) {
    if (method === "Debugger.paused") {
      try {
        await command(tabId, "Debugger.resume");
      } catch (_) {
        // The target may detach between the pause event and this resume request.
      }
    }
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
    try {
      await command(tabId, "Debugger.resume");
    } catch (_) {
      // The target may detach between the pause event and this resume request.
    }
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
      initiatorCallFrames: params.initiator?.stack?.callFrames || [],
      initiatorAsyncStack: params.initiator?.stack?.parent || null
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
  } else if (method === "Network.webSocketCreated") {
    session.webSockets.push({ phase: "created", at, requestId: params.requestId, url: params.url });
  } else if (method === "Network.webSocketHandshakeResponseReceived") {
    session.webSockets.push({ phase: "open", at, requestId: params.requestId, status: params.response?.status });
  } else if (method === "Network.webSocketFrameSent" || method === "Network.webSocketFrameReceived") {
    const frame = params.response || {};
    session.webSockets.push({
      phase: method.endsWith("Sent") ? "sent" : "received",
      at,
      requestId: params.requestId,
      opcode: frame.opcode,
      payloadBytes: typeof frame.payloadData === "string" ? frame.payloadData.length : 0
    });
  } else if (method === "Network.webSocketClosed") {
    session.webSockets.push({ phase: "closed", at, requestId: params.requestId });
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
  try {
    await saveTraceToHistory(session);
  } catch (_) {
    // The completed trace remains available in session storage and the side panel.
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  sessions.delete(tabId);
  void (async () => {
    try {
      await chrome.storage.session.remove(sessionStorageKey(tabId));
    } catch (_) {
      // Storage cleanup is best-effort when Chrome is shutting down.
    }
  })();
});
