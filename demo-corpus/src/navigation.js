const navigationButton = document.getElementById("navigate");
const navigationStatus = document.getElementById("status");

function navigateToOrderDetails() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("view", "order-details");
  history.pushState({ view: "order-details" }, "", nextUrl);
  navigationStatus.textContent = "Current view: order details";
  navigationButton.textContent = "Order details opened";
}

navigationButton.addEventListener("click", navigateToOrderDetails);
