const mappedButton = document.getElementById("mapped-action");
const mappedStatus = document.getElementById("status");

function runMappedScenario() {
  mappedStatus.textContent = "Mapped bundle action completed.";
  mappedButton.textContent = "Mapped action complete";
  document.body.dataset.corpusResult = "mapped";
}

mappedButton.addEventListener("click", runMappedScenario);
