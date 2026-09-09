const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const puppeteer = require("puppeteer");

const root = path.resolve(__dirname, "..");
const storeDirectory = path.join(root, "store-assets");
const siteAssetDirectory = path.join(root, "beta-site", "assets");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "reprolens-marketing-"));
const narration = "Start with the supplied safe demo. It deliberately requests a missing file and returns a four-oh-four, so no account, project, or real customer data is needed. Select the failing button, then record the interaction once. ReproLens connects your click to the page handler and identifies the exact request that failed. The explanation tells you what the error means and suggests the first useful debugging check. Direct browser evidence stays separate from events observed afterward. Finally, review the locally redacted bug report before sharing anything, and download a Playwright test starting point. Traces stay on your device unless you export them.";

function runPanelCapture(caseId, filename) {
  const result = spawnSync(process.execPath, [path.join(root, "e2e", "runner.js")], {
    cwd: root,
    env: {
      ...process.env,
      HEADLESS: "false",
      RUN_MULTI_STEP: "false",
      CORPUS_CASE: caseId,
      PANEL_SCREENSHOT: filename
    },
    encoding: "utf8"
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Could not capture the ${caseId} panel.`);
  }
}

function startDemoServer() {
  const directory = path.join(root, "demo");
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const relative = decodeURIComponent(url.pathname.slice(1)) || "index.html";
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
      response.writeHead(200, { "content-type": contentTypes[path.extname(filename)] || "application/octet-stream" });
      response.end(body);
    });
  });
  return server;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

function asDataUrl(filename) {
  return `data:image/png;base64,${fs.readFileSync(filename).toString("base64")}`;
}

async function waitForImages(page) {
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((image) => image.complete
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", reject, { once: true });
      })));
  });
}

async function captureDemo(page, baseUrl, pathname, selector, output) {
  await page.setViewport({ width: 935, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/${pathname}`, { waitUntil: "networkidle0" });
  await page.click(selector);
  await new Promise((resolve) => setTimeout(resolve, 350));
  await page.screenshot({ path: output });
}

async function composeStoreScreenshot(page, demo, panel, output, panelOffset = 0) {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <html><head><style>
      html, body { width: 1280px; height: 800px; margin: 0; overflow: hidden; background: #0d0c14; }
      body { display: grid; grid-template-columns: 935px 345px; }
      .demo { width: 935px; height: 800px; object-fit: cover; }
      .panel { position: relative; width: 345px; height: 800px; overflow: hidden; border-left: 1px solid #3f3a55; background: #0d0c14; }
      .panel img { position: absolute; inset: -${panelOffset}px auto auto 0; width: 345px; height: auto; }
    </style></head><body>
      <img class="demo" src="${asDataUrl(demo)}" alt="">
      <div class="panel"><img src="${asDataUrl(panel)}" alt=""></div>
    </body></html>`);
  await waitForImages(page);
  await page.screenshot({ path: output });
}

async function capturePromoTile(page, output) {
  const icon = `data:image/svg+xml;base64,${fs.readFileSync(path.join(root, "assets", "reprolens-mark.svg")).toString("base64")}`;
  await page.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <html><head><style>
      html, body { width: 440px; height: 280px; margin: 0; overflow: hidden; }
      body { box-sizing: border-box; display: grid; align-content: center; gap: 18px; padding: 34px; color: #f7f5ff; background: radial-gradient(circle at 80% 20%, #4c3ea0, transparent 190px), #11101a; font-family: Inter, system-ui, sans-serif; }
      header { display: flex; align-items: center; gap: 14px; font-size: 24px; font-weight: 800; }
      img { width: 54px; height: 54px; border-radius: 13px; }
      h1 { max-width: 360px; margin: 0; font-size: 29px; line-height: 1.08; letter-spacing: -1px; }
      p { margin: 0; color: #c5c0d6; font-size: 15px; font-weight: 650; }
    </style></head><body>
      <header><img src="${icon}" alt=""><span>ReproLens</span></header>
      <h1>See what happened after one browser interaction.</h1>
      <p>Explain the failure. Build the report. Start the test.</p>
    </body></html>`);
  await waitForImages(page);
  await page.screenshot({ path: output });
}

async function createWalkthrough(page, screenshots, output) {
  fs.rmSync(output, { force: true });
  const session = await page.createCDPSession();
  await session.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: path.dirname(output) });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.setContent("<!doctype html><html><body style='margin:0;background:#09080f'><canvas width='1280' height='720'></canvas></body></html>");
  const slides = screenshots.map(({ image, title, detail }) => ({
    image: asDataUrl(image),
    title,
    detail
  }));
  await page.evaluate(async ({ slides: slideData, filename }) => {
    const canvas = document.querySelector("canvas");
    const context = canvas.getContext("2d");
    const images = await Promise.all(slideData.map(async (slide) => {
      const image = new Image();
      image.src = slide.image;
      await image.decode();
      return image;
    }));
    const stream = canvas.captureStream(24);
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
      .find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error("This Chrome build cannot encode a WebM walkthrough.");
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1800000 });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
    const duration = 48000;
    const sceneDuration = duration / slideData.length;
    const startedAt = performance.now();
    recorder.start(1000);
    await new Promise((resolve) => {
      function draw(now) {
        const elapsed = Math.min(now - startedAt, duration - 1);
        const index = Math.min(Math.floor(elapsed / sceneDuration), slideData.length - 1);
        const localProgress = (elapsed % sceneDuration) / sceneDuration;
        const image = images[index];
        const slide = slideData[index];
        const sourceY = Math.round(localProgress * 80);
        context.fillStyle = "#09080f";
        context.fillRect(0, 0, 1280, 720);
        context.drawImage(image, 0, sourceY, 1280, 720, 0, 0, 1280, 720);
        context.fillStyle = "rgba(9, 8, 15, .9)";
        context.fillRect(0, 548, 1280, 172);
        context.fillStyle = "#a99fff";
        context.font = "800 18px system-ui, sans-serif";
        context.fillText(`STEP ${index + 1} OF ${slideData.length}`, 56, 588);
        context.fillStyle = "#ffffff";
        context.font = "800 35px system-ui, sans-serif";
        context.fillText(slide.title, 56, 634);
        context.fillStyle = "#c9c5d6";
        context.font = "500 21px system-ui, sans-serif";
        context.fillText(slide.detail, 56, 674);
        if (now - startedAt >= duration) {
          recorder.stop();
          resolve();
          return;
        }
        requestAnimationFrame(draw);
      }
      requestAnimationFrame(draw);
    });
    await stopped;
    const blob = new Blob(chunks, { type: mimeType });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }, { slides, filename: path.basename(output) });

  const deadline = Date.now() + 15000;
  while ((!fs.existsSync(output) || fs.existsSync(`${output}.crdownload`)) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!fs.existsSync(output)) throw new Error("The walkthrough video was not downloaded.");

  const narrationFile = path.join(temporaryDirectory, "reprolens-narration.wav");
  const speech = spawnSync("espeak-ng", [
    "-v", "en-gb",
    "-s", "142",
    "-p", "45",
    "-a", "160",
    "-w", narrationFile,
    narration
  ], { encoding: "utf8" });
  if (speech.status !== 0 || !fs.existsSync(narrationFile)) {
    throw new Error(speech.error?.code === "ENOENT"
      ? "eSpeak NG is required to generate the walkthrough narration."
      : speech.stderr || "Could not generate the walkthrough narration.");
  }

  const narrated = `${output}.narrated.webm`;
  fs.rmSync(narrated, { force: true });
  const mux = spawnSync("gst-launch-1.0", [
    "-q",
    "webmmux", "name=mux", "streamable=false", "!", "filesink", `location=${narrated}`,
    "filesrc", `location=${output}`, "!", "matroskademux", "name=demux",
    "demux.video_0", "!", "queue", "!", "mux.video_0",
    "filesrc", `location=${narrationFile}`, "!", "wavparse", "!", "audioconvert", "!", "audioresample",
    "!", "opusenc", "bitrate=72000", "!", "queue", "!", "mux.audio_0"
  ], { encoding: "utf8" });
  if (mux.status !== 0 || !fs.existsSync(narrated)) {
    throw new Error(mux.error?.code === "ENOENT"
      ? "GStreamer is required to add narration and finalize the walkthrough."
      : mux.stderr || "Could not add narration to the walkthrough video.");
  }
  fs.renameSync(narrated, output);
}

async function main() {
  fs.mkdirSync(storeDirectory, { recursive: true });
  fs.mkdirSync(siteAssetDirectory, { recursive: true });
  const failurePanel = path.join(temporaryDirectory, "failure-panel.png");
  const successPanel = path.join(temporaryDirectory, "success-panel.png");
  runPanelCapture("fetch-failure", failurePanel);
  runPanelCapture("native-success", successPanel);

  const server = startDemoServer();
  const port = await listen(server);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 600000,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    const failureDemo = path.join(temporaryDirectory, "failure-demo.png");
    const successDemo = path.join(temporaryDirectory, "success-demo.png");
    await captureDemo(page, `http://127.0.0.1:${port}`, "failure.html", "#fail-request", failureDemo);
    await captureDemo(page, `http://127.0.0.1:${port}`, "index.html", "#checkout", successDemo);

    const failureScreenshot = path.join(storeDirectory, "store-screenshot-failure.png");
    const successScreenshot = path.join(storeDirectory, "store-screenshot-success.png");
    const reportScreenshot = path.join(storeDirectory, "store-screenshot-report.png");
    await composeStoreScreenshot(page, failureDemo, failurePanel, failureScreenshot);
    await composeStoreScreenshot(page, successDemo, successPanel, successScreenshot);
    await composeStoreScreenshot(page, failureDemo, failurePanel, reportScreenshot, 720);
    await capturePromoTile(page, path.join(storeDirectory, "small-promo-tile.png"));
    await createWalkthrough(page, [
      { image: failureScreenshot, title: "Trigger a safe demo failure", detail: "No production website, account, or customer data is needed." },
      { image: failureScreenshot, title: "Connect the click to the 404", detail: "ReproLens identifies the handler, exact failed request, and visible result." },
      { image: successScreenshot, title: "Separate evidence from observation", detail: "Direct links and later observations are labelled with different certainty." },
      { image: reportScreenshot, title: "Turn the trace into useful work", detail: "Review a redacted bug report and generate a Playwright starting point." }
    ], path.join(siteAssetDirectory, "reprolens-walkthrough.webm"));
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  process.stdout.write("Created current Chrome Web Store and public beta media assets.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
