(function behaviourTracerContentScript() {
  if (window.__behaviourTracerLoaded) return;
  window.__behaviourTracerLoaded = true;

  const OVERLAY_ID = "__behaviour_tracer_overlay";
  const BADGE_ID = "__behaviour_tracer_badge";
  let picking = false;
  let armed = false;
  let hovered = null;
  let selected = null;
  let mutations = [];
  let observer = null;
  let badgeTimer = null;
  let captureMs = 3000;

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
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });
  }

  function __behaviourTracerOnInteraction(event) {
    if (!armed || isOwnElement(event.target)) return;
    armed = false;
    const element = describe(event.target);
    startMutationCapture();
    showBadge("Recording behaviour…");
    void sendRuntimeMessage({
      type: "INTERACTION_START",
      at: Date.now(),
      eventType: event.type,
      element
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
  document.addEventListener("click", __behaviourTracerOnInteraction, true);

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
      captureMs = Math.max(300, Number(message.captureMs) || 3000);
      hideOverlay();
      showBadge("Recording armed — perform one click");
      sendResponse({ ok: true });
    }
    return false;
  });
})();
