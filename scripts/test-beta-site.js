const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const puppeteer = require("puppeteer");
const { AxePuppeteer } = require("@axe-core/puppeteer");

const root = path.resolve(__dirname, "..");
const siteRoot = path.join(root, "site-dist");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".vtt": "text/vtt; charset=utf-8",
  ".webm": "video/webm"
};

function createServer() {
  return http.createServer((request, response) => {
    const requestedPath = new URL(request.url, "http://127.0.0.1").pathname;
    const relative = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
    const resolved = path.resolve(siteRoot, relative);
    if (!resolved.startsWith(`${siteRoot}${path.sep}`) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.setHeader("Content-Type", contentTypes[path.extname(resolved)] || "application/octet-stream");
    fs.createReadStream(resolved).pipe(response);
  });
}

async function auditPage(browser, origin, pathname, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const failedResources = [];
  page.on("requestfailed", (request) => failedResources.push(`${request.url()}: ${request.failure()?.errorText || "failed"}`));
  page.on("response", (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      failedResources.push(`${response.url()}: HTTP ${response.status()}`);
    }
  });

  const response = await page.goto(`${origin}${pathname}`, { waitUntil: "networkidle0" });
  assert.equal(response.status(), 200, `${pathname} did not load successfully`);
  assert.deepEqual(failedResources, [], `${pathname} has failed resources`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${pathname} overflows horizontally by ${overflow}px at ${viewport.width}px`);

  const axe = await new AxePuppeteer(page).analyze();
  const serious = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  assert.deepEqual(serious, [], `${pathname} has serious accessibility violations: ${serious.map((item) => item.id).join(", ")}`);
  await page.close();
}

async function main() {
  assert.ok(fs.existsSync(path.join(siteRoot, "index.html")), "Run npm run build:site before the site audit.");
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  try {
    await auditPage(browser, origin, "/", { width: 1440, height: 900, deviceScaleFactor: 1 });
    await auditPage(browser, origin, "/", { width: 375, height: 812, deviceScaleFactor: 1 });
    await auditPage(browser, origin, "/privacy.html", { width: 375, height: 812, deviceScaleFactor: 1 });
    await auditPage(browser, origin, "/demo/failure.html", { width: 1280, height: 800, deviceScaleFactor: 1 });

    const page = await browser.newPage();
    await page.goto(origin, { waitUntil: "networkidle0" });
    const productChecks = await page.evaluate(async () => {
      const primary = document.querySelector(".actions .primary");
      const demo = document.querySelector('.actions a[href="demo/failure.html"]');
      const video = document.querySelector("video");
      const guided = document.querySelector('.test-invite .button');
      const selfGuided = document.querySelector('.test-invite .text-link');
      const guidedBox = guided.getBoundingClientRect();
      const selfGuidedBox = selfGuided.getBoundingClientRect();
      video.preload = "metadata";
      video.load();
      await new Promise((resolve, reject) => {
        if (video.readyState >= 1) resolve();
        video.addEventListener("loadedmetadata", resolve, { once: true });
        video.addEventListener("error", () => reject(new Error("Walkthrough video metadata did not load")), { once: true });
      });
      return {
        download: primary?.href || "",
        demo: demo?.href || "",
        videoDuration: video.duration,
        videoType: video.canPlayType("video/webm"),
        captions: Boolean(video.querySelector('track[kind="captions"][default]')),
        guidedCenter: guidedBox.left + guidedBox.width / 2,
        selfGuidedCenter: selfGuidedBox.left + selfGuidedBox.width / 2
      };
    });
    assert.match(productChecks.download, /releases\/tag\/v0\.11\.1-beta\.1$/);
    assert.equal(productChecks.demo, `${origin}/demo/failure.html`);
    assert.ok(productChecks.videoDuration >= 45 && productChecks.videoDuration <= 55);
    assert.notEqual(productChecks.videoType, "");
    assert.equal(productChecks.captions, true);
    assert.ok(Math.abs(productChecks.guidedCenter - productChecks.selfGuidedCenter) <= 1, "The self-guided link is not centered under the guided-test button.");

    const decodedAudioBytes = await page.evaluate(async () => {
      const video = document.querySelector("video");
      video.muted = true;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      video.pause();
      return video.webkitAudioDecodedByteCount;
    });
    assert.equal(decodedAudioBytes, 0, "The walkthrough unexpectedly contains an audio track.");
    await page.close();
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  process.stdout.write("Public beta site passed desktop, mobile, accessibility, asset, link, and video checks.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
