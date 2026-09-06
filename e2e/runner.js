const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const puppeteer = require("puppeteer");
const { AxePuppeteer } = require("@axe-core/puppeteer");
const CorpusEvaluator = require("../corpus-evaluator.js");
const TraceCore = require("../trace-core.js");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SOURCE_EXTENSION_ROOT = process.env.EXTENSION_ROOT
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

function createTestExtensionRoot() {
  const runtimeFiles = [
    "manifest.json", "background.js", "content.js", "content.css", "trace-core.js", "source-map.js", "framework-adapter.js",
    "panel.html", "panel.js", "panel.css", "vendor/trace-mapping.js", "vendor/TRACE_MAPPING_LICENSE.txt"
  ];
  const manifestPath = path.join(SOURCE_EXTENSION_ROOT, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.host_permissions?.length || manifest.content_scripts?.length) {
    throw new Error("Production manifest must not grant persistent host access or inject static content scripts");
  }
  if (!manifest.optional_host_permissions?.includes("http://*/*") || !manifest.optional_host_permissions?.includes("https://*/*")) {
    throw new Error("Production manifest must declare optional HTTP and HTTPS host access");
  }

  const destination = fs.mkdtempSync(path.join(os.tmpdir(), "behaviour-tracer-e2e-"));
  for (const relative of runtimeFiles) {
    const source = path.join(SOURCE_EXTENSION_ROOT, relative);
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  manifest.host_permissions = ["http://127.0.0.1/*"];
  fs.writeFileSync(path.join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return destination;
}

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

  await worker.evaluate(async (id) => {
    await chrome.scripting.insertCSS({ target: { tabId: id }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ["content.js"] });
  }, tabId);
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
  const testExtensionRoot = createTestExtensionRoot();
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
      enableExtensions: [testExtensionRoot]
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
    for (const colorScheme of ["light", "dark"]) {
      await controller.emulateMediaFeatures([{ name: "prefers-color-scheme", value: colorScheme }]);
      const accessibility = await new AxePuppeteer(controller).analyze();
      const blockingViolations = accessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
      if (blockingViolations.length) {
        throw new Error(`Panel ${colorScheme}-mode accessibility violations: ${blockingViolations.map((item) => item.id).join(", ")}`);
      }
    }
    await controller.keyboard.press("Tab");
    const focusMoved = await controller.evaluate(() => document.activeElement !== document.body);
    if (!focusMoved) throw new Error("Keyboard focus did not move into the panel controls");
    await controller.evaluate(() => document.getElementById("export-dialog").showModal());
    const dialogAccessibility = await new AxePuppeteer(controller).include("#export-dialog").analyze();
    const dialogViolations = dialogAccessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
    if (dialogViolations.length) {
      throw new Error(`Export dialog accessibility violations: ${dialogViolations.map((item) => item.id).join(", ")}`);
    }
    await controller.evaluate(() => document.getElementById("export-dialog").close());
    const primaryFilterLabel = await controller.$eval('[data-filter="primary"]', (button) => button.textContent.trim());
    if (primaryFilterLabel !== "Primary chain") throw new Error("Primary-chain timeline filter is unavailable");
    process.stdout.write("Panel accessibility audit passed\n");
    const page = await browser.newPage();
    for (const viewport of [{ width: 360, height: 800 }, { width: 1440, height: 1100 }]) {
      await page.setViewport(viewport);
      await page.goto(`http://127.0.0.1:${port}/demo/index.html`, { waitUntil: "domcontentloaded" });
      for (const expectedPath of ["/demo/index.html", "/demo/failure.html", "/demo/index.html"]) {
        if (new URL(page.url()).pathname !== expectedPath) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
            page.click(".demo-links a")
          ]);
        }
        const coverage = await page.evaluate(() => ({
          bodyBlockSize: document.body.getBoundingClientRect().height,
          htmlBlockSize: document.documentElement.getBoundingClientRect().height,
          viewportBlockSize: window.innerHeight,
          canvasBackground: getComputedStyle(document.documentElement).backgroundImage
        }));
        if (coverage.bodyBlockSize < coverage.viewportBlockSize || coverage.htmlBlockSize < coverage.viewportBlockSize) {
          throw new Error(`Demo background did not cover ${viewport.width}x${viewport.height} at ${expectedPath}`);
        }
        if (coverage.canvasBackground === "none") {
          throw new Error(`Demo canvas background was missing at ${expectedPath}`);
        }
      }
    }
    await page.setViewport({ width: 1280, height: 800 });
    process.stdout.write("Demo navigation background audit passed\n");
    const cases = [
      ["react-timer", "/demo-react/index.html", "button", 3500],
      ["native-success", "/demo/index.html", "#checkout"],
      ["fetch-failure", "/demo/failure.html", "#fail-request"],
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
    let lastTrace = null;
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
      lastTrace = trace;
      const result = CorpusEvaluator.evaluateTrace(trace, scenarioId);
      if (trace.timeline.some((event) => typeof event.primaryChain !== "boolean")) {
        throw new Error(`${scenarioId} produced timeline events without primary-chain classification`);
      }
      if (!trace.timeline.find((event) => event.kind === "interaction")?.primaryChain) {
        throw new Error(`${scenarioId} did not anchor the primary chain at the interaction`);
      }
      const plainExplanation = TraceCore.explain(trace);
      if (!plainExplanation.headline || plainExplanation.steps.length < 2) {
        throw new Error(`${scenarioId} did not produce a usable plain-language explanation`);
      }
      if (/callFrames|main-world-hook|confidence/i.test(JSON.stringify(plainExplanation))) {
        throw new Error(`${scenarioId} exposed internal terminology in the plain-language explanation`);
      }
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
    if (!(history.historyBytes > 0) || history.historyBytes > history.historyByteLimit) {
      throw new Error("Local history size budget was not enforced");
    }
    await controller.setViewport({ width: 360, height: 800 });
    await controller.evaluate((trace) => render(trace, true), lastTrace);
    const explanation = await controller.$eval(".explanation", (node) => ({
      text: node.innerText,
      steps: node.querySelectorAll(".explanation-step").length
    }));
    if (explanation.steps < 2) throw new Error("Plain-language explanation did not show an action and result");
    if (/callFrames|main-world-hook|confidence/i.test(explanation.text)) {
      throw new Error("Plain-language explanation exposed internal tracing terminology");
    }
    const technicalOpenByDefault = await controller.$eval("#technical-details", (node) => node.open);
    if (technicalOpenByDefault) throw new Error("Technical trace must use progressive disclosure by default");
    const hasHorizontalOverflow = await controller.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (hasHorizontalOverflow) throw new Error("Panel overflows horizontally at a narrow side-panel width");
    await controller.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const zoomOverflow = await controller.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (zoomOverflow) {
      const overflowSources = await controller.evaluate(() => [...document.querySelectorAll("body *")].reverse()
        .filter((node) => node.scrollWidth > node.clientWidth + 0.5)
        .slice(0, 8)
        .map((node) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${node.className ? `.${String(node.className).trim().replace(/\s+/g, ".")}` : ""} (${node.clientWidth}/${node.scrollWidth})`));
      throw new Error(`Panel overflows horizontally at 200% text size: ${overflowSources.join(", ")}`);
    }
    await controller.evaluate(() => { document.documentElement.style.fontSize = ""; });
    for (const colorScheme of ["light", "dark"]) {
      await controller.emulateMediaFeatures([{ name: "prefers-color-scheme", value: colorScheme }]);
      const resultAccessibility = await new AxePuppeteer(controller).include("#result").analyze();
      const resultViolations = resultAccessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
      if (resultViolations.length) {
        const details = resultViolations.flatMap((violation) => violation.nodes.map((node) => `${violation.id} ${node.target.join(" ")}: ${node.failureSummary}`));
        throw new Error(`Completed ${colorScheme}-mode result accessibility violations: ${details.join(" | ")}`);
      }
    }
    if (process.env.PANEL_SCREENSHOT) {
      await controller.screenshot({ path: path.resolve(PROJECT_ROOT, process.env.PANEL_SCREENSHOT), fullPage: true });
    }
    await controller.$eval("#technical-details > summary", (node) => node.focus());
    await controller.keyboard.press("Enter");
    const technicalOpenedFromKeyboard = await controller.$eval("#technical-details", (node) => node.open);
    if (!technicalOpenedFromKeyboard) throw new Error("Technical trace could not be opened with the keyboard");
    const historyActionHeights = await controller.$eval(".history", (node) => {
      node.open = true;
      return [...node.querySelectorAll(".history-actions button")].map((button) => button.getBoundingClientRect().height);
    });
    if (historyActionHeights.length !== 2 || Math.abs(historyActionHeights[0] - historyActionHeights[1]) > 0.5) {
      throw new Error(`History action buttons have unequal heights: ${historyActionHeights.join(", ")}`);
    }
    process.stdout.write(`\n${passed}/${results.length} useful traces (${rate}%)\n`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    if (browser) await closeBrowser(browser);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(testExtensionRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
