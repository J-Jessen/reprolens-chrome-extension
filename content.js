(function behaviourTracerContentScript() {
  if (window.__behaviourTracerLoaded) return;
  window.__behaviourTracerLoaded = true;

  const OVERLAY_ID = "__behaviour_tracer_overlay";
  const BADGE_ID = "__behaviour_tracer_badge";
  let picking = false;
  let armed = false;
  let multiRecording = false;
  let nextMultiStepId = 1;
  let activeMultiStepId = null;
  let hovered = null;
  let selected = null;
  let mutations = [];
  let observer = null;
  let mutationFlushTimer = null;
  let badgeTimer = null;
  let captureMs = 3000;
  let interactionMode = "auto";
  const INTERACTION_EVENTS = ["click", "keydown", "change", "submit", "drop"];
  const MULTI_STEP_LIMIT = 30;

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function selectorFor(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
    if (element.id) return `#${cssEscape(element.id)}`;
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      const classes = [...node.classList].filter((name) => !name.startsWith("__behaviour_tracer")).slice(0, 2);
      if (classes.length) part += `.${classes.map(cssEscape).join(".")}`;
      const parent = node.parentElement;
      if (parent) {
        const peers = [...parent.children].filter((child) => child.tagName === node.tagName);
        if (peers.length > 1) part += `:nth-of-type(${peers.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  function describe(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      tagName: element.tagName.toLowerCase(),
      selector: selectorFor(element),
      text: (element.innerText || element.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 160),
      role: element.getAttribute("role"),
      href: element instanceof HTMLAnchorElement ? element.href : null,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      computedStyle: {
        display: style.display,
        position: style.position,
        color: style.color,
        backgroundColor: style.backgroundColor,
        font: style.font,
        cursor: style.cursor
      },
      html: element.outerHTML.slice(0, 2000)
    };
  }

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.setAttribute("aria-hidden", "true");
      document.documentElement.appendChild(overlay);
    }
    return overlay;
  }

  function showOverlay(element) {
    const rect = element.getBoundingClientRect();
    const overlay = ensureOverlay();
    overlay.style.setProperty("--behaviour-tracer-left", `${rect.left}px`);
    overlay.style.setProperty("--behaviour-tracer-top", `${rect.top}px`);
    overlay.style.setProperty("--behaviour-tracer-width", `${rect.width}px`);
    overlay.style.setProperty("--behaviour-tracer-height", `${rect.height}px`);
    overlay.classList.add("__behaviour_tracer_visible");
  }

  function hideOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    overlay?.classList.remove("__behaviour_tracer_visible");
  }

  function showBadge(text) {
    if (badgeTimer) {
      clearTimeout(badgeTimer);
      badgeTimer = null;
    }
    let badge = document.getElementById(BADGE_ID);
    if (!badge) {
      badge = document.createElement("div");
      badge.id = BADGE_ID;
      badge.setAttribute("role", "status");
      badge.setAttribute("aria-live", "polite");
      badge.setAttribute("aria-atomic", "true");
      document.documentElement.appendChild(badge);
    }
    badge.textContent = text;
  }

  function __behaviourTracerHideBadge(delay) {
    if (badgeTimer) clearTimeout(badgeTimer);
    badgeTimer = setTimeout(function __behaviourTracerRemoveBadge() {
      document.getElementById(BADGE_ID)?.remove();
      badgeTimer = null;
    }, delay || 0);
  }

  function isOwnElement(element) {
    return element?.id === OVERLAY_ID || element?.id === BADGE_ID;
  }

  function isOwnTree(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(element && (isOwnElement(element) || element.closest?.(`#${OVERLAY_ID}, #${BADGE_ID}`)));
  }

  async function sendRuntimeMessage(message) {
    try {
      await chrome.runtime.sendMessage(message);
    } catch (_) {
      // The extension can be reloaded or the page can close while a trace is active.
    }
  }

  function onPointerMove(event) {
    if (!picking || isOwnElement(event.target)) return;
    hovered = event.target;
    showOverlay(hovered);
  }

  function __behaviourTracerOnPick(event) {
    if (!picking || isOwnElement(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selected = event.target;
    picking = false;
    hideOverlay();
    showBadge("Element selected — start recording in the side panel");
    __behaviourTracerHideBadge(1800);
    void sendRuntimeMessage({
      type: "ELEMENT_SELECTED",
      element: describe(selected)
    });
  }

  function startMutationCapture() {
    mutations = [];
    observer?.disconnect();
    observer = new MutationObserver((records) => {
      const at = Date.now();
      const grouped = new Map();
      for (const record of records) {
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (!target || isOwnElement(target) || target.closest?.(`#${OVERLAY_ID}, #${BADGE_ID}`)) continue;
        const addedNodes = [...record.addedNodes].filter((node) => !isOwnTree(node));
        const removedNodes = [...record.removedNodes].filter((node) => !isOwnTree(node));
        if (record.type === "childList" && !addedNodes.length && !removedNodes.length) continue;
        const key = `${record.type}:${selectorFor(target)}`;
        if (!grouped.has(key)) {
          const textOnly = record.type === "childList"
            && [...addedNodes, ...removedNodes].every((node) => node.nodeType === Node.TEXT_NODE);
          const targetText = (target.innerText || target.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100);
          grouped.set(key, {
            at,
            stepId: activeMultiStepId,
            summary: record.type === "attributes"
              ? `Attribute “${record.attributeName}” changed`
              : record.type === "characterData"
                ? `Text changed${targetText ? ` to “${targetText}”` : ""}`
                : textOnly
                  ? `Text changed${targetText ? ` to “${targetText}”` : ""}`
                  : `${addedNodes.length} node(s) added, ${removedNodes.length} removed`,
            target: selectorFor(target)
          });
        }
      }
      mutations.push(...grouped.values());
      if (multiRecording) scheduleMutationFlush();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });
  }

  function flushMutationBatch() {
    if (mutationFlushTimer) {
      clearTimeout(mutationFlushTimer);
      mutationFlushTimer = null;
    }
    if (!mutations.length) return [];
    const batch = mutations.splice(0, 500);
    void sendRuntimeMessage({ type: "DOM_MUTATIONS", mutations: batch });
    return batch;
  }

  function scheduleMutationFlush() {
    if (mutationFlushTimer) clearTimeout(mutationFlushTimer);
    mutationFlushTimer = setTimeout(function __behaviourTracerFlushMutations() {
      flushMutationBatch();
    }, 300);
  }

  function interactionTarget(event) {
    if (event.type === "submit" && event.submitter instanceof Element) return event.submitter;
    return event.target instanceof Element ? event.target : event.target?.parentElement;
  }

  function selectedInteraction(event, target) {
    if (!selected || !target) return false;
    if (selected === target || selected.contains(target) || target.contains(selected)) return true;
    return event.type === "submit" && event.target instanceof HTMLFormElement && event.target.contains(selected);
  }

  function interactionModeMatches(event) {
    if (interactionMode === "auto") return true;
    const modes = {
      click: "click",
      keyboard: "keydown",
      change: "change",
      submit: "submit",
      drop: "drop"
    };
    return modes[interactionMode] === event.type;
  }

  function interactionMetadata(event) {
    if (event.type !== "keydown") return null;
    const namedKeys = new Set(["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Backspace", "Delete", " "]);
    return { key: namedKeys.has(event.key) ? (event.key === " " ? "Space" : event.key) : "Character key" };
  }

  function isSubmitControl(target) {
    if (!(target instanceof Element)) return false;
    const control = target.closest("button, input");
    if (!control) return false;
    if (control instanceof HTMLButtonElement) return (control.getAttribute("type") || "submit").toLowerCase() === "submit";
    return control instanceof HTMLInputElement && ["submit", "image"].includes(control.type);
  }

  function __behaviourTracerOnInteraction(event) {
    const target = interactionTarget(event);
    const singleMatch = armed && interactionModeMatches(event) && selectedInteraction(event, target);
    if ((!singleMatch && !multiRecording) || isOwnElement(target)) return;
    if (event.type === "keydown" && ["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) return;
    if (multiRecording) {
      if (event.type === "keydown" && interactionMetadata(event)?.key === "Character key") return;
      if (event.type === "click" && isSubmitControl(target)) return;
      if (nextMultiStepId > MULTI_STEP_LIMIT) {
        showBadge("30-step safety limit reached — stop the journey in the side panel");
        return;
      }
      const stepId = nextMultiStepId++;
      activeMultiStepId = stepId;
      showBadge(stepId === MULTI_STEP_LIMIT
        ? "30-step safety limit reached — stop the journey in the side panel"
        : `Recording journey · ${stepId} step${stepId === 1 ? "" : "s"}`);
      void sendRuntimeMessage({
        type: "MULTI_INTERACTION",
        stepId,
        at: Date.now(),
        eventType: event.type,
        element: describe(target),
        metadata: interactionMetadata(event),
        pageUrl: location.href
      });
      return;
    }
    armed = false;
    const element = describe(target);
    startMutationCapture();
    showBadge("Recording behaviour…");
    void sendRuntimeMessage({
      type: "INTERACTION_START",
      at: Date.now(),
      eventType: event.type,
      element,
      metadata: interactionMetadata(event)
    });

    setTimeout(function __behaviourTracerFinishCapture() {
      observer?.disconnect();
      void sendRuntimeMessage({
        type: "DOM_MUTATIONS",
        mutations
      });
      showBadge("Trace captured — open the side panel");
      __behaviourTracerHideBadge(1800);
    }, captureMs);
  }

  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("click", __behaviourTracerOnPick, true);
  for (const eventName of INTERACTION_EVENTS) {
    document.addEventListener(eventName, __behaviourTracerOnInteraction, true);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "START_PICKER") {
      picking = true;
      armed = false;
      hovered = null;
      showBadge("Move over the page and click an element");
      sendResponse({ ok: true });
    } else if (message.type === "ARM_INTERACTION") {
      picking = false;
      armed = true;
      multiRecording = false;
      captureMs = Math.max(300, Number(message.captureMs) || 3000);
      interactionMode = ["auto", "click", "keyboard", "change", "submit", "drop"].includes(message.interactionMode)
        ? message.interactionMode
        : "auto";
      hideOverlay();
      showBadge(`Recording armed — perform ${interactionMode === "auto" ? "the selected interaction" : `a ${interactionMode} interaction`}`);
      sendResponse({ ok: true });
    } else if (message.type === "START_MULTI_RECORDING") {
      picking = false;
      armed = false;
      multiRecording = true;
      nextMultiStepId = Math.max(1, Number(message.nextStepId) || 1);
      activeMultiStepId = nextMultiStepId - 1 || null;
      hideOverlay();
      startMutationCapture();
      showBadge(`Recording journey · ${nextMultiStepId - 1} steps`);
      sendResponse({ ok: true });
    } else if (message.type === "STOP_MULTI_RECORDING") {
      multiRecording = false;
      observer?.disconnect();
      if (mutationFlushTimer) clearTimeout(mutationFlushTimer);
      mutationFlushTimer = null;
      const pendingMutations = mutations.splice(0, 500);
      showBadge("Journey captured — building bug report");
      __behaviourTracerHideBadge(1800);
      sendResponse({ ok: true, mutations: pendingMutations });
    }
    return false;
  });

  window.addEventListener("pagehide", () => {
    if (multiRecording) flushMutationBatch();
  });
})();
