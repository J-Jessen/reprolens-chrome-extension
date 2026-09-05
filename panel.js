let activeTabId = null;
let currentState = null;

const pickButton = document.getElementById("pick");
const recordButton = document.getElementById("record");
const copyButton = document.getElementById("copy");
const previewButton = document.getElementById("preview");
const copyMarkdownButton = document.getElementById("copy-markdown");
const exportDialog = document.getElementById("export-dialog");
const closePreviewButton = document.getElementById("close-preview");
const downloadButton = document.getElementById("download");
const exportPreview = document.getElementById("export-preview");
const redactionReport = document.getElementById("redaction-report");
const historyEnabled = document.getElementById("history-enabled");
const historyList = document.getElementById("history-list");
const clearHistoryButton = document.getElementById("clear-history");
const importTraceButton = document.getElementById("import-trace");
const importFile = document.getElementById("import-file");
const selection = document.getElementById("selection");
const status = document.getElementById("status");
const result = document.getElementById("result");
const empty = document.getElementById("empty");
const summary = document.getElementById("summary");
const timeline = document.getElementById("timeline");
const qualityLabel = document.getElementById("quality-label");
const qualityScore = document.getElementById("quality-score");
const qualityFill = document.getElementById("quality-fill");
const qualityMetrics = document.getElementById("quality-metrics");
const qualityDiagnostics = document.getElementById("quality-diagnostics");
const filters = document.getElementById("filters");
let activeFilter = "all";

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

function safeExport() {
  const exported = TraceCore.redactForExport(currentState || {});
  return { ...exported, json: JSON.stringify(exported.trace, null, 2), total: exported.totalRedactions };
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

function eventCategory(event) {
  if (["request", "response"].includes(event.kind)) return "network";
  if (event.kind === "mutation") return "dom";
  if (event.kind === "exception") return "errors";
  return event.kind;
}

function renderTimeline(events) {
  const visible = activeFilter === "all"
    ? events
    : events.filter((event) => event.kind === "interaction"
      || (activeFilter === "same-origin" ? event.networkScope === "same-origin" : eventCategory(event) === activeFilter));
  const visibleIds = new Set(visible.map((event) => event.id));
  timeline.innerHTML = visible.map((event) => `
    <li class="event ${escapeHtml(event.kind)} ${event.confidence >= .7 ? "primary-chain" : ""} ${event.parentId && visibleIds.has(event.parentId) ? "child-event" : ""}">
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

function render(state, force = false) {
  if (!state || (!force && state.tabId !== activeTabId)) return;
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
  const quality = state.quality || { score: 0, label: "limited", observedEvents: 0, highConfidenceEvents: 0, diagnostics: [] };
  qualityLabel.textContent = `${quality.label[0].toUpperCase()}${quality.label.slice(1)} coverage`;
  qualityScore.textContent = `${quality.score}%`;
  qualityFill.style.width = `${quality.score}%`;
  qualityMetrics.textContent = `${quality.observedEvents} observed events · ${quality.highConfidenceEvents} with strong or direct evidence`;
  qualityDiagnostics.innerHTML = quality.diagnostics.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  qualityDiagnostics.classList.toggle("hidden", !quality.diagnostics.length);
  renderTimeline(events);
}

async function refreshHistory() {
  const history = await chrome.runtime.sendMessage({ type: "GET_HISTORY" });
  historyEnabled.checked = history.historyEnabled;
  clearHistoryButton.disabled = !history.traces.length;
  historyList.innerHTML = history.traces.length ? history.traces.map((trace) => `
    <div class="history-item" data-history-id="${escapeHtml(trace.historyId)}">
      <button class="history-open">
        <strong>${escapeHtml(trace.selectedElement?.text || trace.selectedElement?.selector || "Untitled trace")}</strong>
        <span>${escapeHtml(new Date(trace.savedAt).toLocaleString())} · ${escapeHtml(trace.quality?.score ?? 0)}%</span>
      </button>
      <button class="history-delete quiet" aria-label="Delete trace">×</button>
    </div>
  `).join("") : '<p class="history-empty">No saved traces yet.</p>';
}

filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button || !currentState?.timeline) return;
  activeFilter = button.dataset.filter;
  for (const item of filters.querySelectorAll("[data-filter]")) {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  }
  renderTimeline(currentState.timeline);
});

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
    await refreshHistory();
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
  await navigator.clipboard.writeText(safeExport().json);
  copyButton.textContent = "Copied";
  setTimeout(() => { copyButton.textContent = "Copy JSON"; }, 1200);
});

copyMarkdownButton.addEventListener("click", async () => {
  if (!currentState) return;
  await navigator.clipboard.writeText(TraceCore.markdownReport(currentState));
  copyMarkdownButton.textContent = "Copied";
  setTimeout(() => { copyMarkdownButton.textContent = "Copy report"; }, 1200);
});

previewButton.addEventListener("click", () => {
  const exported = safeExport();
  exportPreview.textContent = exported.json;
  redactionReport.textContent = exported.total
    ? `${exported.total} potentially sensitive value(s) were redacted automatically.`
    : "No known sensitive patterns were found. Review the complete payload before sharing.";
  exportDialog.showModal();
});

closePreviewButton.addEventListener("click", () => exportDialog.close());

downloadButton.addEventListener("click", () => {
  const blob = new Blob([safeExport().json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `behaviour-trace-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

historyEnabled.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({ type: "SET_HISTORY_ENABLED", enabled: historyEnabled.checked });
});

clearHistoryButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" });
  await refreshHistory();
});

importTraceButton.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;
  if (file.size > 2_000_000) {
    setStatus("Import failed: file exceeds 2 MB.");
    return;
  }
  try {
    const trace = JSON.parse(await file.text());
    const response = await chrome.runtime.sendMessage({ type: "IMPORT_TRACE", trace });
    if (!response?.ok) throw new Error(response?.error || "Import failed.");
    setStatus("Trace imported into local history.");
    await refreshHistory();
  } catch (error) {
    setStatus(`Import failed: ${error.message || error}`);
  }
});

historyList.addEventListener("click", async (event) => {
  const item = event.target.closest("[data-history-id]");
  if (!item) return;
  if (event.target.closest(".history-delete")) {
    await chrome.runtime.sendMessage({ type: "DELETE_HISTORY_TRACE", historyId: item.dataset.historyId });
    await refreshHistory();
    return;
  }
  const history = await chrome.runtime.sendMessage({ type: "GET_HISTORY" });
  const trace = history.traces.find((entry) => entry.historyId === item.dataset.historyId);
  if (trace) render(trace, true);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TRACE_STATE") {
    render(message.state);
    if (message.state.status === "complete") refreshHistory().catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(() => refresh());
refresh();
