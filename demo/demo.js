const checkoutButton = document.getElementById("checkout");
const result = document.getElementById("result");

async function submitOrder() {
  checkoutButton.disabled = true;
  checkoutButton.textContent = "Processing…";
  const response = await fetch("./order.json?traceDemo=1");
  const order = await response.json();
  result.textContent = `Order ${order.id} confirmed`;
  checkoutButton.textContent = "Completed";
}

checkoutButton.addEventListener("click", submitOrder);
