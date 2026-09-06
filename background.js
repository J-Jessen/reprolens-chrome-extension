importScripts("trace-core.js", "vendor/trace-mapping.js", "source-map.js", "framework-adapter.js");

const sessions = new Map();
const TRACE_WINDOW_MS = 3500;
const MULTI_TRACE_WINDOW_MS = 120000;
const MULTI_STEP_LIMIT = 30;
const TRACE_ALARM_PREFIX = "behaviour-trace:";
const TIMER_STORE_KEY = "__behaviourTracerAsyncStore_v020";
const HISTORY_LIMIT = 25;
const HISTORY_BYTE_LIMIT = 5_000_000;
const SESSION_KEY_PREFIX = "traceState:";
const FEEDBACK_LIMIT = 100;
const FEEDBACK_KEY = "productFeedback";
const INTERACTION_BREAKPOINTS = ["click", "keydown", "change", "submit", "drop"];

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
    mode: "single",
    multiSteps: [],
    activeStepId: null,
    environment: null,
    handlers: [],
    asyncEvents: [],
    workerEvents: [],
    frameEvents: [],
    executionContexts: [],
    debuggerContexts: {},
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
  try {
    await chrome.storage.session.set({ [sessionStorageKey(session.tabId)]: state });
  } catch (_) {
    // A transient storage failure must not interrupt an active debugger session.
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

function command(target, method, params = {}) {
  const debuggee = typeof target === "number" ? { tabId: target } : target;
  return chrome.debugger.sendCommand(debuggee, method, params);
}

function installTimerHookExpression(captureTimers = true, restoreAfterMs = 10000) {
  function __behaviourTracerInstallTimerHook(captureTimers, restoreAfterMs) {
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
    }, Math.max(10000, Number(restoreAfterMs) || 10000)]);
    return { installed: true, reused: false };
  }

  return `(${__behaviourTracerInstallTimerHook.toString()})(${JSON.stringify(captureTimers)}, ${JSON.stringify(restoreAfterMs)})`;
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

async function installTimerHook(tabId, captureTimers = true, restoreAfterMs = 10000) {
  const response = await command(tabId, "Runtime.evaluate", {
    expression: installTimerHookExpression(captureTimers, restoreAfterMs),
    returnByValue: true,
    silent: true
  });
  if (response?.exceptionDetails || !response?.result?.value?.installed) {
    throw new Error(response?.exceptionDetails?.text || "Could not install the timer fallback.");
  }
}

async function configureTimerCapture(tabId, restoreAfterMs = 10000) {
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
      await installTimerHook(tabId, false, restoreAfterMs);
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
    await installTimerHook(tabId, true, restoreAfterMs);
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

function breakpointEvents(interactionMode) {
  if (interactionMode === "multi") return INTERACTION_BREAKPOINTS.filter((eventName) => eventName !== "keydown");
  const eventByMode = {
    click: "click",
    keyboard: "keydown",
    change: "change",
    submit: "submit",
    drop: "drop"
  };
  return eventByMode[interactionMode] ? [eventByMode[interactionMode]] : INTERACTION_BREAKPOINTS;
}

async function enableRelatedTargets(tabId) {
  try {
    await command(tabId, "Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [
        { type: "iframe", exclude: false },
        { type: "worker", exclude: false },
        { type: "shared_worker", exclude: false }
      ]
    });
    return { available: true, minimumChromeVersion: 125 };
  } catch (error) {
    return { available: false, minimumChromeVersion: 125, error: error.message || String(error) };
  }
}

async function attach(tabId, interactionMode = "auto", restoreAfterMs = 10000) {
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
  await Promise.all(breakpointEvents(interactionMode).map((eventName) => command(
    tabId,
    "DOMDebugger.setEventListenerBreakpoint",
    { eventName }
  )));
  const [timerCapture, relatedTargetCapture] = await Promise.all([
    configureTimerCapture(tabId, restoreAfterMs),
    enableRelatedTargets(tabId)
  ]);
  return { ...timerCapture, relatedTargetCapture };
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

async function captureEnvironment(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        browser: navigator.userAgentData?.brands?.map((brand) => `${brand.brand} ${brand.version}`).join(", ") || navigator.userAgent,
        platform: navigator.userAgentData?.platform || navigator.platform || "Unknown",
        language: navigator.language || "Unknown",
        viewport: { width: window.innerWidth, height: window.innerHeight },
        devicePixelRatio: window.devicePixelRatio || 1
      })
    });
    return result?.result || null;
  } catch (_) {
    return null;
  }
}

async function detach(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {
    // The page may already have closed or navigated.
  }
}

async function startTrace(tabId, traceWindowMs = TRACE_WINDOW_MS, interactionMode = "auto") {
  const previous = sessions.get(tabId) || (await storedSession(tabId)) || blankSession(tabId);
  if (["attaching", "armed", "recording", "multi-recording", "processing"].includes(previous.status)) {
    throw new Error("A trace is already running in this tab.");
  }

  const session = blankSession(tabId);
  session.mode = "single";
  session.traceWindowMs = Math.max(500, Math.min(Number(traceWindowMs) || TRACE_WINDOW_MS, TRACE_WINDOW_MS));
  session.interactionMode = ["auto", "click", "keyboard", "change", "submit", "drop"].includes(interactionMode)
    ? interactionMode
    : "auto";
  session.selectedElement = previous.selectedElement;
  session.status = "attaching";
  session.startedAt = Date.now();
  session.pageUrl = (await chrome.tabs.get(tabId)).url || "";
  session.environment = await captureEnvironment(tabId);
  sessions.set(tabId, session);
  publish(session);

  try {
    session.timerCapture = await attach(tabId, session.interactionMode);
    try {
      session.framework = await inspectFramework(tabId, session.selectedElement?.selector);
    } catch (_) {
      session.framework = null;
    }
    session.status = "armed";
    await chrome.tabs.sendMessage(tabId, {
      type: "ARM_INTERACTION",
      captureMs: Math.max(300, session.traceWindowMs - 200),
      interactionMode: session.interactionMode
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

async function startMultiTrace(tabId) {
  const previous = sessions.get(tabId) || (await storedSession(tabId)) || blankSession(tabId);
  if (["attaching", "armed", "recording", "multi-recording", "processing"].includes(previous.status)) {
    throw new Error("A trace is already running in this tab.");
  }

  const tab = await chrome.tabs.get(tabId);
  const session = blankSession(tabId);
  session.mode = "multi";
  session.interactionMode = "multi";
  session.status = "attaching";
  session.startedAt = Date.now();
  session.pageUrl = tab.url || "";
  session.environment = await captureEnvironment(tabId);
  sessions.set(tabId, session);
  publish(session);

  try {
    session.timerCapture = await attach(tabId, "multi", MULTI_TRACE_WINDOW_MS + 10000);
    session.status = "multi-recording";
    await chrome.tabs.sendMessage(tabId, { type: "START_MULTI_RECORDING", nextStepId: 1 });
    await chrome.alarms.create(`${TRACE_ALARM_PREFIX}${tabId}`, { when: Date.now() + MULTI_TRACE_WINDOW_MS });
    publish(session);
    return publicSession(session);
  } catch (error) {
    session.status = "error";
    session.error = error.message || String(error);
    await detach(tabId);
    publish(session);
    throw error;
  }
}

async function finishTrace(tabId) {
  const session = sessions.get(tabId) || (await storedSession(tabId)) || blankSession(tabId);
  sessions.set(tabId, session);
  if (!["armed", "recording", "multi-recording", "attaching"].includes(session.status)) return;
  if (session.mode === "multi" && session.status === "multi-recording") {
    try {
      const contentResult = await chrome.tabs.sendMessage(tabId, { type: "STOP_MULTI_RECORDING" });
      const room = Math.max(0, 1000 - session.mutations.length);
      if (room && Array.isArray(contentResult?.mutations)) session.mutations.push(...contentResult.mutations.slice(0, room));
    } catch (_) {
      // Navigation or tab closure can remove the content script before final collection.
    }
    if (!session.framework && session.multiSteps[0]?.element?.selector) {
      try { session.framework = await inspectFramework(tabId, session.multiSteps[0].element.selector); } catch (_) { session.framework = null; }
    }
  }
  session.status = "processing";
  publish(session);
  await chrome.alarms.clear(`${TRACE_ALARM_PREFIX}${tabId}`);
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
    return { ok: true, state: await startTrace(tabId, message.traceWindowMs, message.interactionMode) };
  }

  if (message.type === "START_MULTI_TRACE") {
    return { ok: true, state: await startMultiTrace(tabId) };
  }

  if (message.type === "STOP_MULTI_TRACE") {
    const session = sessions.get(tabId) || (await storedSession(tabId)) || blankSession(tabId);
    sessions.set(tabId, session);
    if (Array.isArray(message.mutations) && message.mutations.length) {
      session.mutations.push(...message.mutations.slice(0, Math.max(0, 1000 - session.mutations.length)));
    }
    await finishTrace(tabId);
    return { ok: true, state: await visibleSession(tabId) };
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

  if (message.type === "RENAME_HISTORY_TRACE") {
    const name = String(message.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) return { ok: false, error: "Enter a name for this trace." };
    const { traceHistory } = await chrome.storage.local.get({ traceHistory: [] });
    const trace = traceHistory.find((item) => item.historyId === message.historyId);
    if (!trace) return { ok: false, error: "The saved trace could not be found." };
    trace.displayName = name;
    await chrome.storage.local.set({ traceHistory });
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

  if (message.type === "GET_FEEDBACK") {
    const stored = await chrome.storage.local.get({ [FEEDBACK_KEY]: [] });
    return { ok: true, feedback: stored[FEEDBACK_KEY].slice(0, FEEDBACK_LIMIT) };
  }

  if (message.type === "SAVE_FEEDBACK") {
    const input = message.feedback || {};
    const rating = Math.round(Number(input.rating));
    const clarity = Math.round(Number(input.clarity));
    if (rating < 1 || rating > 5 || clarity < 1 || clarity > 5) {
      return { ok: false, error: "Choose both a usefulness and clarity rating." };
    }
    const redacted = TraceCore.redactForExport({
      traceId: String(input.traceId || "").slice(0, 100),
      rating,
      clarity,
      mostUseful: ["explanation", "interactions", "technical", "network", "source", "framework", "contexts", "history", "journey", "report", "github", "playwright", "ai"].includes(input.mostUseful)
        ? input.mostUseful
        : "",
      comment: String(input.comment || "").trim().slice(0, 600),
      createdAt: Date.now()
    }).trace;
    const safe = {
      traceId: redacted.traceId,
      rating: redacted.rating,
      clarity: redacted.clarity,
      mostUseful: redacted.mostUseful,
      comment: redacted.comment,
      createdAt: redacted.createdAt
    };
    const stored = await chrome.storage.local.get({ [FEEDBACK_KEY]: [] });
    const withoutDuplicate = stored[FEEDBACK_KEY].filter((item) => item.traceId !== safe.traceId);
    await chrome.storage.local.set({ [FEEDBACK_KEY]: [safe, ...withoutDuplicate].slice(0, FEEDBACK_LIMIT) });
    return { ok: true };
  }

  if (message.type === "CLEAR_FEEDBACK") {
    await chrome.storage.local.set({ [FEEDBACK_KEY]: [] });
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
      at: session.interactionAt,
      eventType: message.eventType,
      element: message.element,
      metadata: message.metadata || null
    };
    publish(session);
    await chrome.alarms.create(`${TRACE_ALARM_PREFIX}${tabId}`, {
      when: Date.now() + (session.traceWindowMs || TRACE_WINDOW_MS)
    });
    return { ok: true };
  }

  if (message.type === "MULTI_INTERACTION") {
    const session = sessions.get(tabId) || (await storedSession(tabId)) || blankSession(tabId);
    sessions.set(tabId, session);
    if (session.status !== "multi-recording") return { ok: false, error: "No multi-step recording is active for this tab." };
    if (session.multiSteps.length >= MULTI_STEP_LIMIT) {
      return { ok: false, error: `The ${MULTI_STEP_LIMIT}-step safety limit has been reached.` };
    }
    const at = message.at || Date.now();
    const stepId = session.multiSteps.length + 1;
    const step = {
      stepId,
      at,
      eventType: message.eventType,
      element: message.element,
      metadata: message.metadata || null,
      pageUrl: String(message.pageUrl || session.pageUrl || "").slice(0, 2000)
    };
    session.multiSteps.push(step);
    session.activeStepId = stepId;
    session.interactionAt ||= at;
    session.interaction = step;
    session.selectedElement ||= step.element;
    publish(session);
    return { ok: true, stepId };
  }

  if (message.type === "DOM_MUTATIONS") {
    const session = sessions.get(tabId) || (await storedSession(tabId)) || blankSession(tabId);
    sessions.set(tabId, session);
    if (["recording", "multi-recording", "processing"].includes(session.status)) {
      session.mutations.push(...message.mutations.slice(0, Math.max(0, 1000 - session.mutations.length)));
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

function eventContext(session, source) {
  if (!source?.sessionId) return null;
  const contextId = session.debuggerContexts?.[source.sessionId];
  return session.executionContexts.find((context) => context.contextId === contextId) || null;
}

async function initializeRelatedTarget(source, params, session) {
  const info = params.targetInfo || {};
  const contextId = `context-${session.executionContexts.length + 1}`;
  const context = {
    contextId,
    type: info.type || "related",
    url: info.url || "",
    attachedAt: Date.now(),
    captureStatus: "active"
  };
  session.debuggerContexts[params.sessionId] = contextId;
  session.executionContexts.push(context);
  const relatedSession = { ...source, sessionId: params.sessionId };
  const commands = ["Runtime.enable", "Debugger.enable", "Network.enable", "Log.enable"];
  if (context.type === "iframe") commands.push("Page.enable");
  for (const domainCommand of commands) {
    try {
      await command(relatedSession, domainCommand);
    } catch (error) {
      context.captureStatus = "partial";
      context.captureError = error.message || String(error);
    }
  }
  if (context.type === "iframe") {
    for (const eventName of breakpointEvents(session.interactionMode)) {
      try {
        await command(relatedSession, "DOMDebugger.setEventListenerBreakpoint", { eventName });
      } catch (_) {
        context.captureStatus = "partial";
      }
    }
    try {
      await command(relatedSession, "Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
        filter: [
          { type: "iframe", exclude: false },
          { type: "worker", exclude: false },
          { type: "shared_worker", exclude: false }
        ]
      });
    } catch (_) {
      // Nested related targets are an enhancement on Chrome versions that support flat sessions.
    }
    session.frameEvents.push({
      at: context.attachedAt,
      phase: "attached",
      frameId: contextId,
      url: context.url,
      contextType: "cross-origin iframe",
      captureStatus: context.captureStatus
    });
  } else if (["worker", "shared_worker"].includes(context.type)) {
    session.workerEvents.push({
      at: context.attachedAt,
      phase: "attached",
      workerId: contextId,
      url: context.url,
      contextType: context.type,
      captureStatus: context.captureStatus,
      callFrames: []
    });
  }
}

chrome.debugger.onEvent.addListener(async (source, method, params) => {
  const tabId = source.tabId;
  const session = sessions.get(tabId) || (await storedSession(tabId));
  if (session && !sessions.has(tabId)) sessions.set(tabId, session);
  if (!session || !["attaching", "armed", "recording", "multi-recording", "processing"].includes(session.status)) {
    if (method === "Debugger.paused") {
      try {
        await command(source, "Debugger.resume");
      } catch (_) {
        // The target may detach between the pause event and this resume request.
      }
    }
    return;
  }

  const at = Date.now();
  if (method === "Target.attachedToTarget") {
    await initializeRelatedTarget(source, params, session);
    publish(session);
    return;
  }
  const context = eventContext(session, source);

  if (method === "Debugger.scriptParsed") {
    const scriptKey = source.sessionId ? `${source.sessionId}:${params.scriptId}` : params.scriptId;
    session.scripts[scriptKey] = {
      url: params.url || "",
      sourceMapURL: params.sourceMapURL || "",
      contextId: context?.contextId || null
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
    } else if (params.reason === "EventListener" || INTERACTION_BREAKPOINTS.some((name) => eventName.includes(name))) {
      const frames = TraceCore.usefulFrames(params.callFrames || [], 5);
      if (frames.length) {
        session.handlers.push({
          at,
          stepId: session.activeStepId,
          eventName: eventName || "click",
          callFrames: params.callFrames || [],
          contextId: context?.contextId || null,
          contextType: context?.type || "page"
        });
        publish(session);
      }
    }
    try {
      await command(source, "Debugger.resume");
    } catch (_) {
      // The target may detach between the pause event and this resume request.
    }
    return;
  }

  if (method === "Network.requestWillBeSent") {
    session.network.push({
      phase: "request",
      at,
      stepId: session.activeStepId,
      requestId: params.requestId,
      method: params.request?.method,
      url: params.request?.url,
      type: params.type,
      initiator: params.initiator?.type,
      initiatorCallFrames: params.initiator?.stack?.callFrames || [],
      initiatorAsyncStack: params.initiator?.stack?.parent || null,
      contextId: context?.contextId || null,
      contextType: context?.type || "page"
    });
  } else if (method === "Network.responseReceived") {
    session.network.push({
      phase: "response",
      at,
      stepId: session.activeStepId,
      requestId: params.requestId,
      status: params.response?.status,
      statusText: params.response?.statusText,
      url: params.response?.url,
      type: params.type,
      contextId: context?.contextId || null,
      contextType: context?.type || "page"
    });
  } else if (method === "Network.loadingFailed") {
    session.network.push({
      phase: "failure",
      at,
      stepId: session.activeStepId,
      requestId: params.requestId,
      errorText: params.errorText || "Request failed",
      canceled: Boolean(params.canceled),
      type: params.type,
      contextId: context?.contextId || null,
      contextType: context?.type || "page"
    });
  } else if (method === "Network.webSocketCreated") {
    session.webSockets.push({ phase: "created", at, stepId: session.activeStepId, requestId: params.requestId, url: params.url });
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
      stepId: session.activeStepId,
      text: params.exceptionDetails?.text,
      url: params.exceptionDetails?.url,
      lineNumber: params.exceptionDetails?.lineNumber,
      exceptionDescription: params.exceptionDetails?.exception?.description || "",
      contextId: context?.contextId || null,
      contextType: context?.type || "page"
    });
  } else if (method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(params.type)) {
    session.logs.push({
      at,
      stepId: session.activeStepId,
      level: params.type,
      text: (params.args || []).map((arg) => arg.value ?? arg.description ?? arg.type).join(" "),
      url: params.stackTrace?.callFrames?.[0]?.url || "",
      contextId: context?.contextId || null,
      contextType: context?.type || "page"
    });
  } else if (method === "Log.entryAdded" && ["error", "warning"].includes(params.entry?.level)) {
    session.logs.push({
      at,
      stepId: session.activeStepId,
      level: params.entry.level,
      text: params.entry.text,
      url: params.entry.url || "",
      contextId: context?.contextId || null,
      contextType: context?.type || "page"
    });
  } else if (method === "Page.frameNavigated") {
    session.navigations.push({
      at,
      stepId: session.activeStepId,
      url: params.frame?.url,
      name: params.frame?.name,
      frameId: params.frame?.id,
      parentFrameId: params.frame?.parentId || null,
      contextId: context?.contextId || null,
      contextType: context?.type || "page"
    });
  } else if (method === "Page.navigatedWithinDocument") {
    session.navigations.push({
      at,
      stepId: session.activeStepId,
      url: params.url,
      name: params.navigationType || "same-document",
      contextId: context?.contextId || null,
      contextType: context?.type || "page"
    });
  }

  if (method.startsWith("Network.") || method === "Runtime.exceptionThrown" || method === "Runtime.consoleAPICalled" || method === "Log.entryAdded" || method === "Page.frameNavigated" || method === "Page.navigatedWithinDocument") {
    publish(session);
  }
});

chrome.debugger.onDetach.addListener(async (source, reason) => {
  const session = sessions.get(source.tabId) || (await storedSession(source.tabId));
  if (session && !sessions.has(source.tabId)) sessions.set(source.tabId, session);
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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(TRACE_ALARM_PREFIX)) return;
  const tabId = Number(alarm.name.slice(TRACE_ALARM_PREFIX.length));
  if (!Number.isInteger(tabId)) return;
  void finishTraceSafely(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  void (async () => {
    const session = sessions.get(tabId) || (await storedSession(tabId));
    if (!session || session.status !== "multi-recording") return;
    sessions.set(tabId, session);
    const currentPattern = TraceCore.siteOriginPattern(tab.url || "");
    const originalPattern = TraceCore.siteOriginPattern(session.pageUrl || "");
    if (!currentPattern || currentPattern !== originalPattern) {
      session.stopReason = "The recording stopped when the tab left the website that had been granted access.";
      await finishTraceSafely(tabId);
      return;
    }
    const hasAccess = await chrome.permissions.contains({ origins: [currentPattern] });
    if (!hasAccess) {
      session.stopReason = "The recording stopped because site access is no longer available.";
      await finishTraceSafely(tabId);
      return;
    }
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tabId, { type: "START_MULTI_RECORDING", nextStepId: session.multiSteps.length + 1 });
    } catch (_) {
      session.stopReason = "The recording stopped because the next page could not be inspected.";
      await finishTraceSafely(tabId);
    }
  })();
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
