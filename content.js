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
      Object.assign(overlay.style, {
        position: "fixed",
        zIndex: "2147483646",
        pointerEvents: "none",
        border: "2px solid #6d5efc",
        background: "rgba(109, 94, 252, .12)",
        borderRadius: "4px",
        boxSizing: "border-box",
        display: "none"
      });
      document.documentElement.appendChild(overlay);
    }
    return overlay;
  }

  function showOverlay(element) {
    const rect = element.getBoundingClientRect();
    const overlay = ensureOverlay();
    Object.assign(overlay.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  }

  function hideOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.style.display = "none";
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
      Object.assign(badge.style, {
        position: "fixed",
        top: "14px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "2147483647",
        padding: "9px 14px",
        borderRadius: "999px",
        background: "#17171c",
        color: "#fff",
        font: "600 12px/1.2 system-ui, sans-serif",
        boxShadow: "0 6px 24px rgba(0,0,0,.25)",
        pointerEvents: "none"
      });
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
    chrome.runtime.sendMessage({
      type: "ELEMENT_SELECTED",
      element: describe(selected)
    }).catch(() => {});
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
    chrome.runtime.sendMessage({
      type: "INTERACTION_START",
      at: Date.now(),
      eventType: event.type,
      element
    }).catch(() => {});

    setTimeout(function __behaviourTracerFinishCapture() {
      observer?.disconnect();
      chrome.runtime.sendMessage({
        type: "DOM_MUTATIONS",
        mutations
      }).catch(() => {});
      showBadge("Trace captured — open the side panel");
      __behaviourTracerHideBadge(1800);
    }, 3000);
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
      hideOverlay();
      showBadge("Recording armed — perform one click");
      sendResponse({ ok: true });
    }
    return false;
  });
})();
