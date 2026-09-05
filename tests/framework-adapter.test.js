const assert = require("node:assert/strict");
const test = require("node:test");
const FrameworkAdapter = require("../framework-adapter.js");

test("finds the nearest authored React component without reading props or state", () => {
  function CheckoutCard() {}
  function App() {}

  const appFiber = { tag: 0, type: App, return: null, memoizedProps: { private: "not returned" } };
  const cardFiber = { tag: 0, type: CheckoutCard, return: appFiber, memoizedState: { secret: "not returned" } };
  const hostFiber = { tag: 5, type: "button", return: cardFiber };
  const element = {};
  Object.defineProperty(element, "__reactFiber$test", { value: hostFiber, enumerable: false });

  const result = FrameworkAdapter.inspectReactElement(element);
  assert.deepEqual(result, {
    library: "React",
    owner: "CheckoutCard",
    components: [
      { name: "CheckoutCard", tag: 0 },
      { name: "App", tag: 0 }
    ]
  });
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("builds an escaped MAIN-world inspection expression", () => {
  const expression = FrameworkAdapter.buildInspectionExpression('button[data-id="a\\b"]');
  assert.match(expression, /document\.querySelector/);
  assert.match(expression, /data-id/);
});
