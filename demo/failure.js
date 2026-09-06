const failureButton = document.getElementById("fail-request");
const result = document.getElementById("result");

async function runFailingFetch() {
  failureButton.disabled = true;
  failureButton.textContent = "Requesting…";
  result.className = "result";
  result.textContent = "Waiting for the server response…";

  try {
    const response = await fetch("./missing-order.json?traceDemo=failure");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    result.className = "result success";
    result.textContent = "The request unexpectedly succeeded.";
  } catch (error) {
    console.error(`Expected corpus failure: ${error.message}`);
    result.className = "result error";
    result.textContent = `Handled expected failure: ${error.message} response.`;
  } finally {
    failureButton.disabled = false;
    failureButton.textContent = "Try again";
  }
}

failureButton.addEventListener("click", runFailingFetch);
