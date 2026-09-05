const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");
const CorpusEvaluator = require("../corpus-evaluator.js");

const ROOT = path.resolve(__dirname, "..");
const PORT = 0;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

function createFixtureServer() {
  const mounts = new Map([
    ["/demo/", path.join(ROOT, "demo")],
    ["/demo-react/", path.join(ROOT, "demo-react")],
    ["/demo-corpus/", path.join(ROOT, "demo-corpus")]
  ]);

  return http.createServer((request, response) => {
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

  const start = await extensionMessage(controller, { type: "START_TRACE", tabId, traceWindowMs });
  if (!start?.ok) throw new Error(start?.error || "Trace could not start");
  await page.click(selector);
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
  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS !== "false",
    pipe: true,
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-web-security"
    ],
    enableExtensions: [ROOT]
  });

  try {
    const workerTarget = await browser.waitForTarget(
      (target) => target.type() === "service_worker" && target.url().endsWith("/background.js"),
      { timeout: 10000 }
    );
    const worker = await workerTarget.worker();
    const extensionId = new URL(workerTarget.url()).host;
    const controller = await browser.newPage();
    await controller.goto(`chrome-extension://${extensionId}/panel.html`);
    const page = await browser.newPage();
    const cases = [
      ["react-timer", "/demo-react/index.html", "button", 3500],
      ["native-success", "/demo/index.html", "#checkout"],
      ["fetch-failure", "/demo-corpus/fetch-failure.html", "#run-failure"],
      ["navigation", "/demo-corpus/navigation.html", "#navigate"],
      ["minified-map", "/demo-corpus/minified-map.html", "#mapped-action", 3500],
      ["minified-no-map", "/demo-corpus/minified-no-map.html", "#unmapped-action"],
      ...[
        "dom-text", "dom-attribute", "dom-add", "dom-remove", "timer-zero", "timer-delayed",
        "fetch-get", "fetch-post", "fetch-404", "parallel-fetch", "console-warning", "sync-error",
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
      const trace = await runTrace({
        page,
        worker,
        controller,
        baseUrl: `http://127.0.0.1:${port}`,
        pathname,
        selector,
        traceWindowMs
      });
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
    process.stdout.write(`\n${passed}/${results.length} useful traces (${rate}%)\n`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    await closeBrowser(browser);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
