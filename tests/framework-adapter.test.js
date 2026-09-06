const assert = require("node:assert/strict");
const test = require("node:test");
const FrameworkAdapter = require("../framework-adapter.js");

test("finds the nearest React component and returns only privacy-safe prop and state shape", () => {
  function CheckoutCard() {}
  function App() {}

  const appFiber = { tag: 0, type: App, return: null, memoizedProps: { private: "not returned" } };
  const cardFiber = {
    tag: 0,
    type: CheckoutCard,
    return: appFiber,
    memoizedProps: { total: 42, onSubmit() {}, children: "not returned" },
    memoizedState: { memoizedState: { ready: true, account: "not returned" }, next: { memoizedState: 2, next: null } }
  };
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
    ],
    context: {
      props: [{ name: "total", type: "number" }, { name: "onSubmit", type: "function" }],
      state: [
        { slot: 1, type: "object", keys: [{ name: "ready", type: "boolean" }, { name: "account", type: "string" }] },
        { slot: 2, type: "number" }
      ],
      valuesCaptured: false,
      limits: { maxKeys: 12, maxStateSlots: 8 }
    }
  });
  assert.equal(JSON.stringify(result).includes("not returned"), false);
  assert.equal(JSON.stringify(result).includes("children"), false);
});

test("builds an escaped MAIN-world inspection expression", () => {
  const expression = FrameworkAdapter.buildInspectionExpression('button[data-id="a\\b"]');
  assert.match(expression, /document\.querySelector/);
  assert.match(expression, /data-id/);
});
