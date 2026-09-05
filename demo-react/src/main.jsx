import React, { useState } from "react";
import { createRoot } from "react-dom/client";

const TRACE_DELAY_MS = 280;

function CheckoutCard() {
  const [phase, setPhase] = useState("idle");
  const [orderId, setOrderId] = useState(null);

  async function handleReactCheckout() {
    setPhase("requesting");

    const response = await fetch("./order.json?reactTrace=1");
    if (!response.ok) throw new Error(`Checkout failed with HTTP ${response.status}`);
    const order = await response.json();

    setPhase("settling");
    function applyConfirmedOrder() {
      setOrderId(order.id);
      setPhase("complete");
    }
    window.setTimeout(applyConfirmedOrder, TRACE_DELAY_MS);
  }

  const buttonLabel = phase === "idle"
    ? "Complete React order"
    : phase === "requesting"
      ? "Requesting…"
      : phase === "settling"
        ? "Updating state…"
        : "Completed";

  return (
    <main className="shell">
      <p className="test-label">REACT EVENT DELEGATION TEST</p>
      <section className="card">
        <div className="topline">
          <h1>Async checkout</h1>
          <span className="react-pill">React 19 · delegated onClick</span>
        </div>
        <p className="description">One interaction crosses a React handler, fetch, response, timer, and state-driven DOM update.</p>

        <div className="line-item">
          <div className="product">
            <strong>Trace validation plan</strong>
            <span>Developer tooling · one seat</span>
          </div>
          <strong>€29</strong>
        </div>

        <div className="total">
          <strong>Total · €29</strong>
          <button
            id="react-checkout"
            type="button"
            disabled={phase !== "idle"}
            onClick={handleReactCheckout}
          >
            {buttonLabel}
          </button>
        </div>

        <p id="react-status" className={`status ${phase}`} aria-live="polite">
          {phase === "idle" && "Ready for a trace."}
          {phase === "requesting" && "Request sent from the authored React handler."}
          {phase === "settling" && "Response received; waiting for delayed state update."}
          {phase === "complete" && `Order ${orderId} confirmed through React state.`}
        </p>
      </section>
      <p className="diagnostic">Expected: React dispatcher → handleReactCheckout → GET order.json → 200 → delayed React render</p>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<CheckoutCard />);
