const openCheckout = document.getElementById("open-checkout");
const checkoutForm = document.getElementById("checkout-form");
const testReference = document.getElementById("test-reference");
const status = document.getElementById("status");

openCheckout.addEventListener("click", () => {
  checkoutForm.classList.remove("hidden");
  openCheckout.textContent = "Checkout opened";
  status.textContent = "Checkout form is ready.";
  testReference.focus();
});

testReference.addEventListener("change", () => {
  status.textContent = "Test reference accepted locally.";
});

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "Submitting test order…";
  try {
    const response = await fetch("missing-multi-order.json?demo=journey");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    status.textContent = "Unexpected success.";
  } catch (error) {
    status.textContent = `Checkout failed as expected: ${error.message}.`;
  }
});
