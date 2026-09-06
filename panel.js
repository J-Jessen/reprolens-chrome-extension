let activeTabId = null;
let activeOriginPattern = null;
let currentState = null;
let currentHistory = [];
const comparisonSelection = new Set();
let renameHistoryId = null;
let aiAbortController = null;

const pickButton = document.getElementById("pick");
const recordButton = document.getElementById("record");
const interactionType = document.getElementById("interaction-type");
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
const historySearch = document.getElementById("history-search");
const historyQuery = document.getElementById("history-query");
const historyFilter = document.getElementById("history-filter");
const compareTracesButton = document.getElementById("compare-traces");
const compareSelection = document.getElementById("compare-selection");
const comparison = document.getElementById("comparison");
const comparisonHeadline = document.getElementById("comparison-headline");
const comparisonMetrics = document.getElementById("comparison-metrics");
const comparisonDetails = document.getElementById("comparison-details");
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
const frameworkContext = document.getElementById("framework-context");
const frameworkContextSummary = document.getElementById("framework-context-summary");
const frameworkContextDetails = document.getElementById("framework-context-details");
const aiDetails = document.getElementById("ai-details");
const aiInputCode = document.getElementById("ai-input-code");
const generateAiButton = document.getElementById("generate-ai");
const stopAiButton = document.getElementById("stop-ai");
const aiStatus = document.getElementById("ai-status");
const aiOutput = document.getElementById("ai-output");
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
const feedbackCard = document.getElementById("feedback-card");
const feedbackForm = document.getElementById("feedback-form");
const downloadFeedbackButton = document.getElementById("download-feedback");
const clearFeedbackButton = document.getElementById("clear-feedback");
const feedbackStatus = document.getElementById("feedback-status");
const renameDialog = document.getElementById("rename-dialog");
const renameForm = document.getElementById("rename-form");
const renameInput = document.getElementById("rename-input");
const cancelRenameButton = document.getElementById("cancel-rename");
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
    armed: "Armed — perform the selected interaction on the page",
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

function renderFrameworkContext(state) {
  const framework = state.framework;
  const context = framework?.context;
  if (!framework?.owner || !context) {
    frameworkContext.classList.add("hidden");
    return;
  }
  frameworkContext.classList.remove("hidden");
  frameworkContextSummary.textContent = `${framework.library || "Framework"} component ${framework.owner}. Values were not captured.`;
  const propLabels = (context.props || []).map((prop) => `${prop.name} (${prop.type})`);
  const stateLabels = (context.state || []).map((slot) => {
    const keys = (slot.keys || []).map((key) => key.name).join(", ");
    return `Slot ${slot.slot}: ${slot.type}${keys ? ` with keys ${keys}` : ""}`;
  });
  const rows = [
    ["Component path", (framework.components || []).map((component) => component.name).join(" → ") || framework.owner],
    ["Props", propLabels.join(", ") || "No named props observed"],
    ["State shape", stateLabels.join("; ") || "No state slots observed"]
  ];
  frameworkContextDetails.replaceChildren(...rows.flatMap(([term, description]) => [
    element("dt", { text: term }),
    element("dd", { text: description })
  ]));
}

function resetAiForTrace(state) {
  aiAbortController?.abort();
  aiAbortController = null;
  const input = TraceCore.buildAiInput(state);
  aiInputCode.textContent = input;
  aiStatus.textContent = "";
  stopAiButton.classList.add("hidden");
  generateAiButton.disabled = false;
  const cached = sessionStorage.getItem(`ai:${state.traceId}`);
  aiOutput.textContent = cached || "";
  aiOutput.classList.toggle("hidden", !cached);
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
  interactionType.disabled = ["attaching", "armed", "recording", "processing"].includes(state.status);
  setStatus(statusText(state), ["armed", "recording"].includes(state.status));

  const events = state.timeline?.length ? state.timeline : [];
  if (state.status !== "complete" || !events.length) {
    result.classList.add("hidden");
    feedbackCard.classList.add("hidden");
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  result.classList.remove("hidden");
  feedbackCard.classList.remove("hidden");
  renderExplanation(state);
  renderFrameworkContext(state);
  technicalCount.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
  const traceIdentity = state.traceId || `${state.tabId}:${state.startedAt}`;
  if (traceIdentity !== lastExplainedTraceId) {
    technicalDetails.open = false;
    aiDetails.open = false;
    resetAiForTrace(state);
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
  currentHistory = history.traces;
  for (const historyId of [...comparisonSelection]) {
    if (!currentHistory.some((trace) => trace.historyId === historyId)) comparisonSelection.delete(historyId);
  }
  historyCount.textContent = `${history.traces.length} saved`;
  clearHistoryButton.disabled = !history.traces.length;
  const usedMb = ((history.historyBytes || 0) / 1_000_000).toFixed(2);
  const limitMb = ((history.historyByteLimit || 0) / 1_000_000).toFixed(0);
  historyUsage.textContent = `${history.traces.length} of 25 traces · ${usedMb} MB of ${limitMb} MB local budget`;
  renderHistoryList();
}

function traceHasProblems(trace) {
  return (trace.timeline || []).some((event) => event.kind === "exception"
    || event.kind === "network-failure"
    || (event.kind === "response" && Number(event.status) >= 400));
}

function visibleHistory() {
  const query = historyQuery.value.trim().toLocaleLowerCase();
  const filter = historyFilter.value;
  return currentHistory.filter((trace) => {
    const haystack = [trace.displayName, trace.selectedElement?.text, trace.selectedElement?.selector, trace.pageUrl]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (filter === "problems") return traceHasProblems(trace);
    if (["strong", "partial", "limited"].includes(filter)) return trace.quality?.label === filter;
    return true;
  });
}

function updateComparisonControls() {
  const selectedCount = comparisonSelection.size;
  compareTracesButton.disabled = selectedCount !== 2;
  compareSelection.textContent = selectedCount === 2 ? "Ready to compare" : `Select ${2 - selectedCount} more trace${2 - selectedCount === 1 ? "" : "s"}`;
}

function renderHistoryList() {
  const traces = visibleHistory();
  if (!traces.length) {
    historyList.replaceChildren(element("li", { className: "history-empty", text: currentHistory.length ? "No traces match these filters." : "No saved traces yet." }));
    updateComparisonControls();
    return;
  }
  const items = traces.map((trace, index) => {
    const title = trace.displayName || trace.selectedElement?.text || trace.selectedElement?.selector || "Untitled trace";
    const item = element("li", { className: "history-item" });
    item.dataset.historyId = trace.historyId;
    const compareId = `compare-${index}`;
    const compare = element("input");
    compare.type = "checkbox";
    compare.id = compareId;
    compare.className = "history-compare";
    compare.checked = comparisonSelection.has(trace.historyId);
    const compareLabel = element("label", { className: "visually-hidden", text: `Select ${title} for comparison` });
    compareLabel.setAttribute("for", compareId);
    const open = element("button", { className: "history-open", type: "button" });
    open.append(element("strong", { text: title }));
    open.append(element("span", { text: `${new Date(trace.savedAt).toLocaleString()} · ${trace.quality?.score ?? 0}%` }));
    const actions = element("div", { className: "history-item-actions" });
    const rename = element("button", { className: "history-rename quiet", text: "Rename", type: "button" });
    rename.setAttribute("aria-label", `Rename trace: ${title}`);
    const remove = element("button", { className: "history-delete quiet", text: "Delete", type: "button" });
    remove.setAttribute("aria-label", `Delete trace: ${title}`);
    actions.append(rename, remove);
    item.append(compare, compareLabel, open, actions);
    return item;
  });
  historyList.replaceChildren(...items);
  updateComparisonControls();
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

generateAiButton.addEventListener("click", async () => {
  if (!currentState) return;
  if (!("LanguageModel" in globalThis)) {
    aiStatus.textContent = "On-device AI is unavailable here. The deterministic explanation remains fully available.";
    return;
  }
  generateAiButton.disabled = true;
  stopAiButton.classList.remove("hidden");
  aiOutput.classList.remove("hidden");
  aiOutput.textContent = "";
  aiAbortController = new AbortController();
  let session = null;
  try {
    const availability = await LanguageModel.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }]
    });
    if (availability === "unavailable") throw new Error("The local language model is unavailable on this device.");
    aiStatus.textContent = availability === "downloadable" ? "Preparing the local model…" : "Generating a local second opinion…";
    session = await LanguageModel.create({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
      temperature: 0.2,
      topK: 3,
      initialPrompts: [{
        role: "system",
        content: "You are a cautious frontend debugging assistant. Explain only evidence in the supplied redacted trace. Clearly separate direct browser evidence from observations. Give a concise diagnosis and no more than three concrete checks. Never claim that timing alone proves causality."
      }],
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          const percent = Math.round((Number(event.loaded) || 0) * 100);
          aiStatus.textContent = `Downloading the local model: ${percent}%`;
        });
      }
    });
    aiStatus.textContent = "Generating a local second opinion…";
    let complete = "";
    const stream = session.promptStreaming(aiInputCode.textContent, { signal: aiAbortController.signal });
    for await (const chunk of stream) {
      complete += chunk;
      aiOutput.textContent = complete;
    }
    sessionStorage.setItem(`ai:${currentState.traceId}`, complete);
    aiStatus.textContent = "Local AI explanation complete. Verify it against the deterministic trace.";
  } catch (error) {
    aiStatus.textContent = error?.name === "AbortError"
      ? "Local AI generation stopped."
      : `Local AI unavailable: ${errorMessage(error, "generation failed")}`;
    aiOutput.classList.toggle("hidden", !aiOutput.textContent);
  } finally {
    session?.destroy();
    aiAbortController = null;
    generateAiButton.disabled = false;
    stopAiButton.classList.add("hidden");
  }
});

stopAiButton.addEventListener("click", () => aiAbortController?.abort());

historySearch.addEventListener("submit", (event) => {
  event.preventDefault();
  renderHistoryList();
});
historyQuery.addEventListener("input", () => renderHistoryList());
historyFilter.addEventListener("change", () => renderHistoryList());

compareTracesButton.addEventListener("click", () => {
  if (comparisonSelection.size !== 2) return;
  const traces = [...comparisonSelection]
    .map((historyId) => currentHistory.find((trace) => trace.historyId === historyId))
    .filter(Boolean)
    .sort((left, right) => (left.savedAt || 0) - (right.savedAt || 0));
  if (traces.length !== 2) return;
  const compared = TraceCore.compareTraces(traces[0], traces[1]);
  comparison.classList.remove("hidden");
  const traceName = (trace) => trace.displayName || trace.selectedElement?.text || trace.selectedElement?.selector || "Untitled trace";
  comparisonHeadline.textContent = `${traceName(traces[0])} → ${traceName(traces[1])}: ${compared.headline}.`;
  const metricRows = [
    ["Trace quality", `${compared.quality.before}% → ${compared.quality.after}% (${compared.quality.delta >= 0 ? "+" : ""}${compared.quality.delta})`],
    ["Detected problems", `${compared.problems.before} → ${compared.problems.after} (${compared.problems.delta >= 0 ? "+" : ""}${compared.problems.delta})`]
  ];
  comparisonMetrics.replaceChildren(...metricRows.flatMap(([term, description]) => [
    element("dt", { text: term }),
    element("dd", { text: description })
  ]));
  const details = [
    ...compared.eventChanges.map((item) => `${item.kind}: ${item.before} → ${item.after}`),
    ...compared.addedRequests.map((request) => `New request: ${request}`),
    ...compared.removedRequests.map((request) => `Removed request: ${request}`),
    ...(compared.componentChange ? [`Component: ${compared.componentChange.before} → ${compared.componentChange.after}`] : [])
  ];
  comparisonDetails.replaceChildren(...(details.length ? details : ["The event structure, requests, component, and problem count are unchanged."]).map((detail) => element("li", { text: detail })));
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
    const response = await chrome.runtime.sendMessage({
      type: "START_TRACE",
      tabId: activeTabId,
      interactionMode: interactionType.value
    });
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
    comparisonSelection.clear();
    comparison.classList.add("hidden");
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
    if (event.target.closest(".history-compare")) {
      const checkbox = event.target.closest(".history-compare");
      if (checkbox.checked && comparisonSelection.size >= 2) {
        checkbox.checked = false;
        setStatus("Select only two traces for comparison.");
      } else if (checkbox.checked) {
        comparisonSelection.add(item.dataset.historyId);
      } else {
        comparisonSelection.delete(item.dataset.historyId);
      }
      comparison.classList.add("hidden");
      updateComparisonControls();
      return;
    }
    if (event.target.closest(".history-rename")) {
      const trace = currentHistory.find((entry) => entry.historyId === item.dataset.historyId);
      if (!trace) throw new Error("Could not find the saved trace.");
      renameHistoryId = trace.historyId;
      renameInput.value = trace.displayName || trace.selectedElement?.text || trace.selectedElement?.selector || "";
      renameDialog.showModal();
      renameInput.select();
      return;
    }
    if (event.target.closest(".history-delete")) {
      const response = await chrome.runtime.sendMessage({ type: "DELETE_HISTORY_TRACE", historyId: item.dataset.historyId });
      if (!response?.ok) throw new Error(response?.error || "Could not delete trace.");
      comparisonSelection.delete(item.dataset.historyId);
      await refreshHistory();
      return;
    }
    if (!event.target.closest(".history-open")) return;
    const trace = currentHistory.find((entry) => entry.historyId === item.dataset.historyId);
    if (trace) render(trace, true);
  } catch (error) {
    setStatus(errorMessage(error, "Could not open local trace."));
  }
});

renameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!renameForm.reportValidity() || !renameHistoryId) return;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "RENAME_HISTORY_TRACE",
      historyId: renameHistoryId,
      name: renameInput.value
    });
    if (!response?.ok) throw new Error(response?.error || "Could not rename trace.");
    renameDialog.close();
    renameHistoryId = null;
    await refreshHistory();
    setStatus("Trace renamed.");
  } catch (error) {
    setStatus(errorMessage(error, "Could not rename trace."));
  }
});

cancelRenameButton.addEventListener("click", () => {
  renameHistoryId = null;
  renameDialog.close();
});

feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentState || !feedbackForm.reportValidity()) return;
  const data = new FormData(feedbackForm);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "SAVE_FEEDBACK",
      feedback: {
        traceId: currentState.traceId,
        rating: data.get("rating"),
        clarity: data.get("clarity"),
        mostUseful: data.get("most-useful"),
        comment: data.get("comment")
      }
    });
    if (!response?.ok) throw new Error(response?.error || "Could not save feedback.");
    feedbackStatus.textContent = "Feedback saved locally for this trace.";
  } catch (error) {
    feedbackStatus.textContent = errorMessage(error, "Could not save feedback.");
  }
});

downloadFeedbackButton.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_FEEDBACK" });
    if (!response?.ok) throw new Error(response?.error || "Could not load feedback.");
    if (!response.feedback.length) {
      feedbackStatus.textContent = "No local feedback has been saved yet.";
      return;
    }
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, feedback: response.feedback }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `behaviour-tracer-feedback-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    feedbackStatus.textContent = `${response.feedback.length} feedback entr${response.feedback.length === 1 ? "y" : "ies"} downloaded.`;
  } catch (error) {
    feedbackStatus.textContent = errorMessage(error, "Could not download feedback.");
  }
});

clearFeedbackButton.addEventListener("click", async () => {
  if (!window.confirm("Delete all locally saved beta feedback? This cannot be undone.")) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: "CLEAR_FEEDBACK" });
    if (!response?.ok) throw new Error(response?.error || "Could not clear feedback.");
    feedbackStatus.textContent = "Local feedback cleared.";
  } catch (error) {
    feedbackStatus.textContent = errorMessage(error, "Could not clear feedback.");
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
