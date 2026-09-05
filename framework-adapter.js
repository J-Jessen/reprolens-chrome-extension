(function exposeFrameworkAdapter(root) {
  function inspectReactElement(element) {
    if (!element) return null;

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

    const propertyNames = Object.getOwnPropertyNames(element);
    const fiberKey = propertyNames.find((name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
    if (!fiberKey) return null;

    const components = [];
    const seen = new Set();
    let fiber = element[fiberKey];
    for (let depth = 0; fiber && depth < 40; depth += 1, fiber = fiber.return) {
      const name = nameForType(fiber.type || fiber.elementType);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      components.push({ name, tag: fiber.tag });
    }

    if (!components.length) return { library: "React", owner: null, components: [] };
    return {
      library: "React",
      owner: components[0].name,
      components
    };
  }

  function buildInspectionExpression(selector) {
    return `(${inspectReactElement.toString()})(document.querySelector(${JSON.stringify(selector)}))`;
  }

  const api = { buildInspectionExpression, inspectReactElement };
  root.FrameworkAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
