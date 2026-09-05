importScripts("trace-core.js", "vendor/trace-mapping.js", "source-map.js", "framework-adapter.js");

const sessions = new Map();
const TRACE_WINDOW_MS = 3500;
const TIMER_STORE_KEY = "__behaviourTracerTimerStore_v014";

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

function blankSession(tabId) {
  return {
    schemaVersion: 1,
    tabId,
    status: "idle",
    selectedElement: null,
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

function command(tabId, method, params = {}) {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

function installTimerHookExpression() {
  function __behaviourTracerInstallTimerHook() {
    const key = "__behaviourTracerTimerStore_v014";
    const existing = window[key];
    if (existing?.installed) {
      existing.events.length = 0;
      return { installed: true, reused: true };
    }

    const nativeSetTimeout = window.setTimeout;
    const store = {
      installed: true,
      events: [],
      nativeSetTimeout,
      nextTimerId: 1,
      wrapper: null,
      autoRestoreId: null
    };

    function __behaviourTracerSetTimeout(callback, delay, ...args) {
      const timerId = store.nextTimerId++;
      store.events.push({
        phase: "scheduled",
        at: Date.now(),
        timerId,
        delay: Number(delay) || 0,
        callbackName: typeof callback === "function" ? callback.name || "(anonymous)" : "(string callback)",
        stack: new Error().stack || ""
      });

      if (typeof callback !== "function") {
        return Reflect.apply(nativeSetTimeout, this, [callback, delay, ...args]);
      }

      function __behaviourTracerTimerCallback(...callbackArgs) {
        store.events.push({
          phase: "callback",
          at: Date.now(),
          timerId,
          callbackName: callback.name || "(anonymous)"
        });
        return Reflect.apply(callback, this, callbackArgs);
      }

      return Reflect.apply(nativeSetTimeout, this, [__behaviourTracerTimerCallback, delay, ...args]);
    }

    store.wrapper = __behaviourTracerSetTimeout;
    Object.defineProperty(window, key, { configurable: true, value: store });
    window.setTimeout = __behaviourTracerSetTimeout;
    store.autoRestoreId = Reflect.apply(nativeSetTimeout, window, [function __behaviourTracerAutoRestore() {
      if (window.setTimeout === store.wrapper) window.setTimeout = store.nativeSetTimeout;
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
    if (window.setTimeout === store.wrapper) window.setTimeout = store.nativeSetTimeout;
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
  for (const domain of ["EventBreakpoints", "DOMDebugger"]) {
    try {
      await Promise.all([
        command(tabId, `${domain}.setInstrumentationBreakpoint`, { eventName: "setTimeout" }),
        command(tabId, `${domain}.setInstrumentationBreakpoint`, { eventName: "setTimeout.callback" })
      ]);
      return { mode: "cdp", domain };
    } catch (error) {
      failures.push(error.message || String(error));
      await Promise.all([
        command(tabId, `${domain}.removeInstrumentationBreakpoint`, { eventName: "setTimeout" }).catch(() => {}),
        command(tabId, `${domain}.removeInstrumentationBreakpoint`, { eventName: "setTimeout.callback" }).catch(() => {})
      ]);
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
        eventName: "hook:setTimeout",
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
        eventName: "hook:setTimeout.callback",
        timerId: raw.timerId,
        callbackName: raw.callbackName,
        captureMode: "main-world-hook",
        callFrames: [{ functionName: raw.callbackName || "(anonymous)", url: "" }],
        asyncStackTrace: schedule ? {
          description: "setTimeout",
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
    if (eventName.startsWith("instrumentation:setTimeout")) {
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
});

chrome.tabs.onRemoved.addListener((tabId) => sessions.delete(tabId));
