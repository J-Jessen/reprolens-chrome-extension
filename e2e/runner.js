const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");
const { AxePuppeteer } = require("@axe-core/puppeteer");
const CorpusEvaluator = require("../corpus-evaluator.js");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const EXTENSION_ROOT = process.env.EXTENSION_ROOT
  ? path.resolve(PROJECT_ROOT, process.env.EXTENSION_ROOT)
  : PROJECT_ROOT;
const PORT = 0;
const CASE_TIMEOUT_MS = 30000;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

function createFixtureServer() {
  const mounts = new Map([
    ["/demo/", path.join(PROJECT_ROOT, "demo")],
    ["/demo-react/", path.join(PROJECT_ROOT, "demo-react")],
    ["/demo-corpus/", path.join(PROJECT_ROOT, "demo-corpus")]
  ]);

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/api/ok") {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ message: "GET complete" }));
      return;
    }
    if (url.pathname === "/api/post" && request.method === "POST") {
      request.resume();
      request.on("end", () => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ message: "POST complete" })));
      return;
    }
    if (url.pathname === "/api/missing") {
      response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ message: "Missing" }));
      return;
    }
    const mount = [...mounts].find(([prefix]) => url.pathname.startsWith(prefix));
    if (!mount) {
      response.writeHead(404).end("Not found");
      return;
    }

    const [prefix, directory] = mount;
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html";
    const filename = path.resolve(directory, relative);
    if (!filename.startsWith(`${directory}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    fs.readFile(filename, (error, body) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
        return;
      }
      let payload = body;
      if (path.extname(filename) === ".js") {
        const sourceMapName = body.toString().match(/sourceMappingURL=([^\s]+)/)?.[1];
        const sourceMapPath = sourceMapName && path.resolve(path.dirname(filename), sourceMapName);
        if (sourceMapPath?.startsWith(`${directory}${path.sep}`) && fs.existsSync(sourceMapPath)) {
          const encodedMap = fs.readFileSync(sourceMapPath).toString("base64");
          payload = Buffer.from(body.toString().replace(
            `sourceMappingURL=${sourceMapName}`,
            `sourceMappingURL=data:application/json;base64,${encodedMap}`
          ));
        }
      }
      response.writeHead(200, {
        "content-type": MIME_TYPES[path.extname(filename)] || "application/octet-stream",
        "access-control-allow-origin": "*"
      });
      response.end(payload);
    });
  });
  server.on("upgrade", (request, socket) => {
    if (request.url !== "/socket" || !request.headers["sec-websocket-key"]) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash("sha1")
      .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n"
    ].join("\r\n"));
    const payload = Buffer.from("ready");
    socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
    setTimeout(() => socket.end(), 150);
  });
  return server;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function extensionMessage(controller, message) {
  return controller.evaluate((payload) => chrome.runtime.sendMessage(payload), message);
}

async function closeBrowser(browser) {
  const process = browser.process();
  await Promise.race([
    browser.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 2000))
  ]);
  if (process?.exitCode == null) process.kill("SIGKILL");
}

async function withTimeout(promise, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function runTrace({ page, worker, controller, baseUrl, pathname, selector, traceWindowMs = 1200 }) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(selector);
  const tabId = await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url });
    return tabs[0]?.id;
  }, page.url());
  if (!tabId) throw new Error(`Could not find Chrome tab for ${page.url()}`);

  await worker.evaluate((id) => chrome.tabs.sendMessage(id, { type: "START_PICKER" }), tabId);
  await page.click(selector);
  await page.waitForFunction((value) => document.querySelector(value), {}, selector);

  await page.evaluate((value) => {
    setTimeout(() => document.querySelector(value)?.click(), 2000);
  }, selector);
  const start = await extensionMessage(controller, { type: "START_TRACE", tabId, traceWindowMs });
  if (!start?.ok) throw new Error(start?.error || "Trace could not start");
  const interactionDeadline = Date.now() + 7000;
  while (true) {
    const current = await extensionMessage(controller, { type: "GET_STATE", tabId });
    if (current.status === "recording") break;
    if (current.status === "error") throw new Error(current.error);
    if (Date.now() >= interactionDeadline) throw new Error(`Timed out waiting for interaction (${current.status})`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, traceWindowMs + 100));
  await extensionMessage(controller, { type: "CANCEL_TRACE", tabId });

  let state;
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const poll = async () => {
      state = await extensionMessage(controller, { type: "GET_STATE", tabId });
      if (state.status === "complete") return resolve();
      if (state.status === "error") return reject(new Error(state.error));
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for trace (${state.status})`));
      setTimeout(poll, 100);
    };
    poll().catch(reject);
  });
  return state;
}

async function main() {
  const server = createFixtureServer();
  const port = await listen(server);
  process.stdout.write(`Fixture server listening on ${port}\n`);
  process.stdout.write(`Launching browser (headless=${process.env.HEADLESS !== "false"})\n`);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: process.env.HEADLESS !== "false",
      pipe: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-web-security"
      ],
      enableExtensions: [EXTENSION_ROOT]
    });
    process.stdout.write("Browser launched\n");

    const workerTarget = await browser.waitForTarget(
      (target) => target.type() === "service_worker" && target.url().endsWith("/background.js"),
      { timeout: 10000 }
    );
    process.stdout.write("Extension service worker ready\n");
    const worker = await workerTarget.worker();
    const extensionId = new URL(workerTarget.url()).host;
    const controller = await browser.newPage();
    await controller.goto(`chrome-extension://${extensionId}/panel.html`);
    const accessibility = await new AxePuppeteer(controller).analyze();
    const blockingViolations = accessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
    if (blockingViolations.length) {
      throw new Error(`Panel accessibility violations: ${blockingViolations.map((item) => item.id).join(", ")}`);
    }
    process.stdout.write("Panel accessibility audit passed\n");
    const page = await browser.newPage();
    const cases = [
      ["react-timer", "/demo-react/index.html", "button", 3500],
      ["native-success", "/demo/index.html", "#checkout"],
      ["fetch-failure", "/demo-corpus/fetch-failure.html", "#run-failure"],
      ["navigation", "/demo-corpus/navigation.html", "#navigate"],
      ["minified-map", "/demo-corpus/minified-map.html", "#mapped-action", 3500],
      ["minified-no-map", "/demo-corpus/minified-no-map.html", "#unmapped-action"],
      ...[
        "dom-text", "dom-attribute", "dom-add", "dom-remove", "timer-zero", "timer-delayed", "timer-interval", "animation-frame", "promise-chain", "queue-microtask", "worker-message",
        "fetch-get", "fetch-post", "fetch-404", "parallel-fetch", "websocket-message", "console-warning", "sync-error",
        "hash-navigation", "history-replace"
      ].map((id) => [id, `/demo-corpus/automated.html?case=${id}`, "#action"])
    ];
    const requestedIds = (process.env.CORPUS_CASES || process.env.CORPUS_CASE || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const selectedCases = requestedIds.length
      ? cases.filter(([scenarioId]) => requestedIds.includes(scenarioId))
      : cases;
    if (selectedCases.length !== (requestedIds.length || cases.length)) {
      throw new Error(`Unknown or duplicate corpus case in: ${requestedIds.join(", ")}`);
    }
    const results = [];
    for (const [scenarioId, pathname, selector, traceWindowMs] of selectedCases) {
      process.stdout.write(`START ${scenarioId}\n`);
      const trace = await withTimeout(runTrace({
        page,
        worker,
        controller,
        baseUrl: `http://127.0.0.1:${port}`,
        pathname,
        selector,
        traceWindowMs
      }), CASE_TIMEOUT_MS, scenarioId);
      const result = CorpusEvaluator.evaluateTrace(trace, scenarioId);
      results.push(result);
      const mark = result.passed ? "PASS" : "FAIL";
      process.stdout.write(`${mark} ${scenarioId} (${result.score}%)\n`);
      for (const check of result.checks.filter((item) => !item.passed)) {
        process.stdout.write(`  - ${check.label}\n`);
      }
      if (!result.passed) {
        process.stdout.write(`  diagnostics: ${JSON.stringify({ sourceMaps: trace.sourceMaps, handlers: trace.handlers })}\n`);
      }
    }

    const passed = results.filter((result) => result.passed).length;
    const rate = Math.round((passed / results.length) * 100);
    const historyDeadline = Date.now() + 5000;
    let history;
    do {
      history = await extensionMessage(controller, { type: "GET_HISTORY" });
      if (history.traces?.length >= Math.min(selectedCases.length, 25)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < historyDeadline);
    if (history.historyEnabled !== true || history.traces?.length < Math.min(selectedCases.length, 25)) {
      throw new Error(`Local history did not retain completed traces (${history.traces?.length || 0}/${selectedCases.length})`);
    }
    process.stdout.write(`\n${passed}/${results.length} useful traces (${rate}%)\n`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    if (browser) await closeBrowser(browser);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
