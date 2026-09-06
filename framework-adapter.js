(function exposeFrameworkAdapter(root) {
  function inspectReactElement(element) {
    if (!element) return null;

    const MAX_COMPONENTS = 12;
    const MAX_KEYS = 12;
    const MAX_STATE_SLOTS = 8;

    function nameForType(type) {
      if (typeof type === "function") return type.displayName || type.name || null;
      if (!type || typeof type !== "object") return null;
      return type.displayName
        || type.render?.displayName
        || type.render?.name
        || type.type?.displayName
        || type.type?.name
        || null;
    }

    function valueType(value) {
      if (value === null) return "null";
      if (Array.isArray(value)) return "array";
      return typeof value;
    }

    function keyShapes(value) {
      if (!value || typeof value !== "object") return [];
      return Object.keys(value)
        .filter((name) => name !== "children" && !name.startsWith("__"))
        .slice(0, MAX_KEYS)
        .map((name) => ({ name: String(name).slice(0, 80), type: valueType(value[name]) }));
    }

    function componentContext(fiber) {
      const props = keyShapes(fiber?.memoizedProps);
      const state = [];
      if (fiber?.tag === 1 && fiber.memoizedState && typeof fiber.memoizedState === "object") {
        state.push({ slot: 1, type: "object", keys: keyShapes(fiber.memoizedState) });
      } else {
        let hook = fiber?.memoizedState;
        const seenHooks = new Set();
        while (hook && typeof hook === "object" && "memoizedState" in hook && state.length < MAX_STATE_SLOTS && !seenHooks.has(hook)) {
          seenHooks.add(hook);
          const value = hook.memoizedState;
          state.push({
            slot: state.length + 1,
            type: valueType(value),
            ...(value && typeof value === "object" && !Array.isArray(value) ? { keys: keyShapes(value) } : {})
          });
          hook = hook.next;
        }
      }
      return {
        props,
        state,
        valuesCaptured: false,
        limits: { maxKeys: MAX_KEYS, maxStateSlots: MAX_STATE_SLOTS }
      };
    }

    const propertyNames = Object.getOwnPropertyNames(element);
    const fiberKey = propertyNames.find((name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
    if (!fiberKey) return null;

    const components = [];
    const seen = new Set();
    let ownerFiber = null;
    let fiber = element[fiberKey];
    for (let depth = 0; fiber && depth < 40; depth += 1, fiber = fiber.return) {
      const name = nameForType(fiber.type || fiber.elementType);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      if (!ownerFiber) ownerFiber = fiber;
      components.push({ name, tag: fiber.tag });
      if (components.length >= MAX_COMPONENTS) break;
    }

    if (!components.length) return { library: "React", owner: null, components: [], context: null };
    return {
      library: "React",
      owner: components[0].name,
      components,
      context: componentContext(ownerFiber)
    };
  }

  function buildInspectionExpression(selector) {
    return `(${inspectReactElement.toString()})(document.querySelector(${JSON.stringify(selector)}))`;
  }

  const api = { buildInspectionExpression, inspectReactElement };
  root.FrameworkAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
