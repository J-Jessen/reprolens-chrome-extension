const scenarioId = new URLSearchParams(location.search).get("case") || "dom-text";
const title = document.getElementById("title");
const status = document.getElementById("status");
const items = document.getElementById("items");
const action = document.getElementById("action");

title.textContent = scenarioId;
action.textContent = `Run ${scenarioId}`;

const actions = {
  "dom-text": function changeText() {
    status.textContent = "Text mutation complete";
  },
  "dom-attribute": function changeAttribute() {
    status.setAttribute("data-state", "complete");
  },
  "dom-add": function addNode() {
    items.append(Object.assign(document.createElement("span"), { textContent: "Added item" }));
  },
  "dom-remove": function removeNode() {
    items.firstElementChild?.remove();
  },
  "timer-zero": function scheduleImmediateTimer() {
    setTimeout(function immediateTimerCallback() { status.textContent = "Immediate timer complete"; }, 0);
  },
  "timer-delayed": function scheduleDelayedTimer() {
    setTimeout(function delayedTimerCallback() { status.textContent = "Delayed timer complete"; }, 200);
  },
  "timer-interval": function scheduleInterval() {
    let count = 0;
    const intervalId = setInterval(function intervalTimerCallback() {
      count += 1;
      status.textContent = `Interval tick ${count}`;
      if (count === 2) clearInterval(intervalId);
    }, 60);
  },
  "animation-frame": function scheduleAnimationFrame() {
    requestAnimationFrame(function animationFrameCallback() {
      status.textContent = "Animation frame complete";
    });
  },
  "fetch-get": async function fetchGet() {
    const response = await fetch("/api/ok?case=fetch-get");
    status.textContent = (await response.json()).message;
  },
  "fetch-post": async function fetchPost() {
    const response = await fetch("/api/post", { method: "POST", body: JSON.stringify({ secret: "not-exported" }) });
    status.textContent = (await response.json()).message;
  },
  "fetch-404": async function fetchMissing() {
    const response = await fetch("/api/missing");
    status.textContent = `Handled status ${response.status}`;
  },
  "parallel-fetch": async function fetchInParallel() {
    const responses = await Promise.all([fetch("/api/ok?item=1"), fetch("/api/ok?item=2")]);
    status.textContent = `${responses.length} requests complete`;
  },
  "websocket-message": function openSocket() {
    const socket = new WebSocket(`ws://${location.host}/socket`);
    socket.addEventListener("open", () => socket.send("ping"));
    socket.addEventListener("message", () => { status.textContent = "WebSocket message received"; });
  },
  "console-warning": function logWarning() {
    console.warn("Expected automated corpus warning");
    status.textContent = "Warning logged";
  },
  "sync-error": function throwSynchronousError() {
    status.textContent = "About to throw";
    throw new Error("Expected automated corpus exception");
  },
  "hash-navigation": function navigateHash() {
    location.hash = "trace-complete";
    status.textContent = "Hash navigation complete";
  },
  "history-replace": function replaceHistoryState() {
    history.replaceState({ traced: true }, "", "?case=history-replace&view=complete");
    status.textContent = "History replacement complete";
  }
};

action.addEventListener("click", actions[scenarioId] || actions["dom-text"]);
