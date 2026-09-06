const scenario = new URLSearchParams(location.search).get("case") || "keyboard";
const title = document.getElementById("title");
const status = document.getElementById("status");
const keyboardAction = document.getElementById("keyboard-action");
const changeAction = document.getElementById("change-action");
const changeLabel = document.getElementById("change-label");
const submitForm = document.getElementById("submit-form");
const dropAction = document.getElementById("drop-action");

title.textContent = `${scenario} interaction`;

if (scenario === "keyboard") keyboardAction.hidden = false;
if (scenario === "change") {
  changeLabel.hidden = false;
  changeAction.hidden = false;
}
if (scenario === "submit") submitForm.hidden = false;
if (scenario === "drop") dropAction.hidden = false;

keyboardAction.addEventListener("keydown", function handleKeyboardAction(event) {
  if (event.key === "Enter") status.textContent = "Keyboard action complete";
});

changeAction.addEventListener("change", function handleInputChange() {
  status.textContent = "Input change complete";
});

submitForm.addEventListener("submit", function handleFormSubmit(event) {
  event.preventDefault();
  status.textContent = "Form submission complete";
});

dropAction.addEventListener("drop", function handleDrop(event) {
  event.preventDefault();
  status.textContent = "Drop action complete";
});
