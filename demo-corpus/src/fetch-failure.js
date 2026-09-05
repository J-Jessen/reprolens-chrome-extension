const failureButton = document.getElementById("run-failure");
const failureStatus = document.getElementById("status");

async function runFailingFetch() {
  failureButton.disabled = true;
  failureStatus.textContent = "Requesting a deliberately missing resource…";
  try {
    const response = await fetch("./missing-order.json?case=fetch-failure");
    if (!response.ok) throw new Error(`Expected HTTP failure: ${response.status}`);
  } catch (error) {
    console.error("Expected corpus failure", error.message);
    failureStatus.textContent = `Handled expected failure: ${error.message}`;
    failureButton.textContent = "Failure handled";
  }
}

failureButton.addEventListener("click", runFailingFetch);
