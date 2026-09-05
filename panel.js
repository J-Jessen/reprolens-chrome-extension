let activeTabId = null;
let currentState = null;

const pickButton = document.getElementById("pick");
const recordButton = document.getElementById("record");
const copyButton = document.getElementById("copy");
const selection = document.getElementById("selection");
const status = document.getElementById("status");
const result = document.getElementById("result");
const empty = document.getElementById("empty");
const summary = document.getElementById("summary");
const timeline = document.getElementById("timeline");

function setStatus(text, recording) {
  status.textContent = text;
  status.classList.toggle("recording", Boolean(recording));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusText(state) {
  const labels = {
    idle: "Ready",
    selected: "Element selected",
    attaching: "Connecting to Chrome debugger…",
    armed: "Armed — click the selected element on the page",
    recording: "Recording for 3.5 seconds…",
    processing: "Building trace…",
    complete: "Trace complete",
    error: state.error || "Trace failed"
  };
  return labels[state.status] || state.status;
}

function render(state) {
  if (!state || state.tabId !== activeTabId) return;
  currentState = state;
  const element = state.selectedElement;
  selection.textContent = element
    ? `${element.selector}${element.text ? ` · ${element.text.slice(0, 70)}` : ""}`
    : "No element selected";
  selection.classList.toggle("muted", !element);
  recordButton.disabled = !element || ["attaching", "armed", "recording", "processing"].includes(state.status);
  pickButton.disabled = ["attaching", "armed", "recording", "processing"].includes(state.status);
  setStatus(statusText(state), ["armed", "recording"].includes(state.status));

  const events = state.timeline?.length ? state.timeline : [];
  if (state.status !== "complete" || !events.length) {
    result.classList.add("hidden");
    empty.style.display = "grid";
    return;
  }

  empty.style.display = "none";
  result.classList.remove("hidden");
  summary.textContent = state.summary;
  timeline.innerHTML = events.map((event) => `
    <li class="event ${escapeHtml(event.kind)}">
      <div class="time">+${escapeHtml(event.atMs)}ms</div>
      <div class="dot"></div>
      <div class="event-body">
        <p class="event-title">${escapeHtml(event.title)}</p>
        ${event.detail ? `<p class="event-detail">${escapeHtml(event.detail)}</p>` : ""}
        <span class="badge ${escapeHtml(event.confidenceLabel)}">${escapeHtml(event.confidenceLabel)} · ${Math.round(event.confidence * 100)}%</span>
      </div>
    </li>
  `).join("");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser tab found.");
  if (!/^https?:/.test(tab.url || "")) throw new Error("Open a normal http(s) page to start tracing.");
  activeTabId = tab.id;
  return tab;
}

async function refresh() {
  try {
    await getActiveTab();
    const state = await chrome.runtime.sendMessage({ type: "GET_STATE", tabId: activeTabId });
    render(state);
  } catch (error) {
    setStatus(error.message || String(error));
    pickButton.disabled = true;
    recordButton.disabled = true;
  }
}

pickButton.addEventListener("click", async () => {
  try {
    await getActiveTab();
    await chrome.tabs.sendMessage(activeTabId, { type: "START_PICKER" });
    setStatus("Click an element on the page");
  } catch (error) {
    setStatus(error.message || "Reload the page once after installing the extension.");
  }
});

recordButton.addEventListener("click", async () => {
  recordButton.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "START_TRACE", tabId: activeTabId });
    if (!response?.ok) throw new Error(response?.error || "Could not start trace.");
    render(response.state);
  } catch (error) {
    setStatus(error.message || String(error));
    recordButton.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {
  if (!currentState) return;
  await navigator.clipboard.writeText(JSON.stringify(currentState, null, 2));
  copyButton.textContent = "Copied";
  setTimeout(() => { copyButton.textContent = "Copy JSON"; }, 1200);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TRACE_STATE") render(message.state);
});

chrome.tabs.onActivated.addListener(() => refresh());
refresh();
