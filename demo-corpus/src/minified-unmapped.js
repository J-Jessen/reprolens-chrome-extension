const unmappedButton = document.getElementById("unmapped-action");
const unmappedStatus = document.getElementById("status");

function runUnmappedScenario() {
  unmappedStatus.textContent = "Unmapped bundle action completed.";
  unmappedButton.textContent = "Unmapped action complete";
  document.body.dataset.corpusResult = "unmapped";
}

unmappedButton.addEventListener("click", runUnmappedScenario);
