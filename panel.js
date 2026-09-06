let activeTabId = null;
let activeOriginPattern = null;
let currentState = null;

const pickButton = document.getElementById("pick");
const recordButton = document.getElementById("record");
const copyButton = document.getElementById("copy");
const previewButton = document.getElementById("preview");
const copyMarkdownButton = document.getElementById("copy-markdown");
const exportDialog = document.getElementById("export-dialog");
const closePreviewButton = document.getElementById("close-preview");
const downloadButton = document.getElementById("download");
const exportPreview = document.getElementById("export-preview-code");
const redactionReport = document.getElementById("redaction-report");
const historyEnabled = document.getElementById("history-enabled");
const historyCount = document.getElementById("history-count");
const historyList = document.getElementById("history-list");
const historyUsage = document.getElementById("history-usage");
const clearHistoryButton = document.getElementById("clear-history");
const importTraceButton = document.getElementById("import-trace");
const importFile = document.getElementById("import-file");
const selection = document.getElementById("selection");
const status = document.getElementById("status");
const result = document.getElementById("result");
const empty = document.getElementById("empty");
const explanationHeadline = document.getElementById("explanation-headline");
const explanationOverview = document.getElementById("explanation-overview");
const explanationSteps = document.getElementById("explanation-steps");
const evidenceNote = document.getElementById("evidence-note");
const technicalDetails = document.getElementById("technical-details");
const technicalCount = document.getElementById("technical-count");
const summary = document.getElementById("summary");
const timeline = document.getElementById("timeline");
const qualityLabel = document.getElementById("quality-label");
const qualityScore = document.getElementById("quality-score");
const qualityFill = document.getElementById("quality-fill");
const qualityMetrics = document.getElementById("quality-metrics");
const qualityDiagnostics = document.getElementById("quality-diagnostics");
const filters = document.getElementById("filters");
let activeFilter = "all";
let lastExplainedTraceId = null;

function setStatus(text, recording) {
  status.textContent = text;
  status.classList.toggle("recording", Boolean(recording));
}

function element(tagName, options = {}) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.type) node.type = options.type;
  return node;
}

function errorMessage(error, fallback) {
  return error?.message || String(error || fallback);
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
    complete: "Trace complete — explanation ready",
    error: state.error || "Trace failed"
  };
  return labels[state.status] || state.status;
}

function renderTimeline(events) {
  const visible = TraceCore.filterTimeline(events, activeFilter);
  const visibleIds = new Set(visible.map((event) => event.id));
  const fragment = document.createDocumentFragment();
  for (const event of visible) {
    const item = element("li", { className: "event" });
    const safeKind = String(event.kind || "event").replace(/[^a-z0-9_-]/gi, "-");
    const safeConfidence = String(event.confidenceLabel || "possible").replace(/[^a-z0-9_-]/gi, "-");
    item.classList.add(safeKind);
    if (event.primaryChain) item.classList.add("primary-chain");
    if (event.parentId && visibleIds.has(event.parentId)) item.classList.add("child-event");
    item.append(element("div", { className: "time", text: `+${event.atMs}ms` }));
    item.append(element("div", { className: "dot" }));
    const body = element("div", { className: "event-body" });
    body.append(element("p", { className: "event-title", text: event.title }));
    if (event.detail) body.append(element("p", { className: "event-detail", text: event.detail }));
    const confidence = Number.isFinite(event.confidence) ? event.confidence : 0;
    body.append(element("span", {
      className: `badge ${safeConfidence}`,
      text: `${event.confidenceLabel || "possible"} · ${Math.round(confidence * 100)}%`
    }));
    item.append(body);
    fragment.append(item);
  }
  timeline.replaceChildren(fragment);
}

function renderExplanation(state) {
  const explanation = TraceCore.explain(state);
  explanationHeadline.textContent = explanation.headline;
  explanationOverview.textContent = explanation.overview;
  evidenceNote.textContent = explanation.evidenceNote;
  const items = explanation.steps.map((step) => {
    const safeKind = String(step.kind || "step").replace(/[^a-z0-9_-]/gi, "-");
    const item = element("li", { className: `explanation-step ${safeKind}` });
    const content = element("div", { className: "explanation-step-content" });
    const heading = element("div", { className: "explanation-step-heading" });
    heading.append(element("p", { className: "explanation-step-label", text: step.label }));
    const relationClass = step.relation === "Direct link" || step.relation === "Starting point"
      ? "linked"
      : step.relation === "Limited evidence" ? "limited" : "observed";
    heading.append(element("span", { className: `relation ${relationClass}`, text: step.relation }));
    content.append(heading);
    content.append(element("strong", { text: step.title }));
    if (step.detail) content.append(element("p", { className: "explanation-step-detail", text: step.detail }));
    item.append(content);
    return item;
  });
  explanationSteps.replaceChildren(...items);
}

function render(state, force = false) {
  if (!state || (!force && state.tabId !== activeTabId)) return;
  currentState = state;
  const selectedElement = state.selectedElement;
  selection.textContent = selectedElement
    ? `${selectedElement.selector}${selectedElement.text ? ` · ${selectedElement.text.slice(0, 70)}` : ""}`
    : "No element selected";
  selection.classList.toggle("muted", !selectedElement);
  recordButton.disabled = !selectedElement || ["attaching", "armed", "recording", "processing"].includes(state.status);
  pickButton.disabled = ["attaching", "armed", "recording", "processing"].includes(state.status);
  setStatus(statusText(state), ["armed", "recording"].includes(state.status));

  const events = state.timeline?.length ? state.timeline : [];
  if (state.status !== "complete" || !events.length) {
    result.classList.add("hidden");
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  result.classList.remove("hidden");
  renderExplanation(state);
  technicalCount.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
  const traceIdentity = state.traceId || `${state.tabId}:${state.startedAt}`;
  if (traceIdentity !== lastExplainedTraceId) {
    technicalDetails.open = false;
    lastExplainedTraceId = traceIdentity;
  }
  summary.textContent = state.summary;
  const quality = state.quality || { score: 0, label: "limited", observedEvents: 0, highConfidenceEvents: 0, diagnostics: [] };
  const qualityName = String(quality.label || "limited");
  const diagnostics = Array.isArray(quality.diagnostics) ? quality.diagnostics : [];
  qualityLabel.textContent = `${qualityName[0].toUpperCase()}${qualityName.slice(1)} coverage`;
  qualityScore.textContent = `${quality.score}%`;
  const boundedScore = Math.max(0, Math.min(100, Number(quality.score) || 0));
  qualityFill.style.setProperty("--quality-score", `${boundedScore}%`);
  qualityFill.parentElement.setAttribute("aria-valuenow", String(boundedScore));
  qualityMetrics.textContent = `${quality.observedEvents} observed events · ${quality.highConfidenceEvents} with strong or direct evidence`;
  qualityDiagnostics.replaceChildren(...diagnostics.map((item) => element("li", { text: item })));
  qualityDiagnostics.classList.toggle("hidden", !diagnostics.length);
  renderTimeline(events);
}

async function refreshHistory() {
  const history = await chrome.runtime.sendMessage({ type: "GET_HISTORY" });
  if (!history || history.ok === false) throw new Error(history?.error || "Could not load local history.");
  historyEnabled.checked = history.historyEnabled;
  historyCount.textContent = `${history.traces.length} saved`;
  clearHistoryButton.disabled = !history.traces.length;
  const usedMb = ((history.historyBytes || 0) / 1_000_000).toFixed(2);
  const limitMb = ((history.historyByteLimit || 0) / 1_000_000).toFixed(0);
  historyUsage.textContent = `${history.traces.length} of 25 traces · ${usedMb} MB of ${limitMb} MB local budget`;
  if (!history.traces.length) {
    historyList.replaceChildren(element("li", { className: "history-empty", text: "No saved traces yet." }));
    return;
  }
  const items = history.traces.map((trace) => {
    const title = trace.selectedElement?.text || trace.selectedElement?.selector || "Untitled trace";
    const item = element("li", { className: "history-item" });
    item.dataset.historyId = trace.historyId;
    const open = element("button", { className: "history-open", type: "button" });
    open.append(element("strong", { text: title }));
    open.append(element("span", { text: `${new Date(trace.savedAt).toLocaleString()} · ${trace.quality?.score ?? 0}%` }));
    const remove = element("button", { className: "history-delete quiet", text: "×", type: "button" });
    remove.setAttribute("aria-label", `Delete trace: ${title}`);
    item.append(open, remove);
    return item;
  });
  historyList.replaceChildren(...items);
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
  const originPattern = TraceCore.siteOriginPattern(tab.url);
  if (!originPattern) throw new Error("Open a normal http(s) page to start tracing.");
  activeTabId = tab.id;
  activeOriginPattern = originPattern;
  return tab;
}

async function ensureSiteAccess() {
  if (!activeTabId || !activeOriginPattern) throw new Error("Open the extension again on the website you want to inspect.");
  const granted = await chrome.permissions.request({ origins: [activeOriginPattern] });
  if (!granted) throw new Error("Site access was not granted. Select the element again when you are ready.");
  await chrome.scripting.insertCSS({
    target: { tabId: activeTabId },
    files: ["content.css"]
  });
  await chrome.scripting.executeScript({
    target: { tabId: activeTabId },
    files: ["content.js"]
  });
}

async function refresh() {
  try {
    await getActiveTab();
    const state = await chrome.runtime.sendMessage({ type: "GET_STATE", tabId: activeTabId });
    if (!state || state.ok === false) throw new Error(state?.error || "Could not load the active trace.");
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
    await ensureSiteAccess();
    await chrome.tabs.sendMessage(activeTabId, { type: "START_PICKER" });
    setStatus("Click an element on the page");
  } catch (error) {
    setStatus(error.message || "Site access could not be enabled.");
  }
});

recordButton.addEventListener("click", async () => {
  recordButton.disabled = true;
  try {
    await ensureSiteAccess();
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
  try {
    await navigator.clipboard.writeText(safeExport().json);
    copyButton.textContent = "Copied";
    setTimeout(() => { copyButton.textContent = "Copy safe JSON"; }, 1200);
  } catch (error) {
    setStatus(`Copy failed: ${errorMessage(error, "clipboard unavailable")}`);
  }
});

copyMarkdownButton.addEventListener("click", async () => {
  if (!currentState) return;
  try {
    await navigator.clipboard.writeText(TraceCore.markdownReport(currentState));
    copyMarkdownButton.textContent = "Copied";
    setTimeout(() => { copyMarkdownButton.textContent = "Copy report"; }, 1200);
  } catch (error) {
    setStatus(`Copy failed: ${errorMessage(error, "clipboard unavailable")}`);
  }
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
  try {
    const response = await chrome.runtime.sendMessage({ type: "SET_HISTORY_ENABLED", enabled: historyEnabled.checked });
    if (!response?.ok) throw new Error(response?.error || "Could not update history settings.");
  } catch (error) {
    historyEnabled.checked = !historyEnabled.checked;
    setStatus(errorMessage(error, "Could not update history settings."));
  }
});

clearHistoryButton.addEventListener("click", async () => {
  if (!window.confirm("Delete all locally saved traces? This cannot be undone.")) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" });
    if (!response?.ok) throw new Error(response?.error || "Could not clear history.");
    await refreshHistory();
    setStatus("Local trace history cleared.");
  } catch (error) {
    setStatus(errorMessage(error, "Could not clear history."));
  }
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
  try {
    if (event.target.closest(".history-delete")) {
      const response = await chrome.runtime.sendMessage({ type: "DELETE_HISTORY_TRACE", historyId: item.dataset.historyId });
      if (!response?.ok) throw new Error(response?.error || "Could not delete trace.");
      await refreshHistory();
      return;
    }
    const history = await chrome.runtime.sendMessage({ type: "GET_HISTORY" });
    if (!history || history.ok === false) throw new Error(history?.error || "Could not load local history.");
    const trace = history.traces.find((entry) => entry.historyId === item.dataset.historyId);
    if (trace) render(trace, true);
  } catch (error) {
    setStatus(errorMessage(error, "Could not open local trace."));
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TRACE_STATE") {
    render(message.state);
    if (message.state.status === "complete") {
      void (async () => {
        try {
          await refreshHistory();
        } catch (error) {
          setStatus(errorMessage(error, "Could not refresh local history."));
        }
      })();
    }
  }
});

chrome.tabs.onActivated.addListener(() => refresh());
void refresh();
