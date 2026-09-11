const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const manifest = JSON.parse(read("manifest.json"));

function pngDimensions(relative) {
  const contents = fs.readFileSync(path.join(root, relative));
  assert.equal(contents.toString("ascii", 1, 4), "PNG", `${relative} is not a PNG file`);
  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20)
  };
}

test("manifest follows the extension's Chrome 118+ permission policy", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(Number.parseInt(manifest.minimum_chrome_version, 10) >= 118);
  assert.deepEqual(manifest.permissions.sort(), ["alarms", "debugger", "scripting", "sidePanel", "storage", "tabs"].sort());
  assert.deepEqual(manifest.optional_host_permissions.sort(), ["http://*/*", "https://*/*"].sort());
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.side_panel.default_path, "panel.html");
  assert.equal(manifest.action.default_title, "Open ConsoleHawk");
});

test("every manifest and panel runtime reference exists locally", () => {
  const panel = read("panel.html");
  const references = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    ...[...panel.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map((match) => match[1])
  ];
  for (const relative of references) {
    assert.ok(fs.existsSync(path.join(root, relative)), `Missing runtime file: ${relative}`);
  }
});

test("manifest icons exist at the exact Chrome-required dimensions", () => {
  const expected = { 16: 16, 32: 32, 48: 48, 128: 128 };
  assert.deepEqual(Object.keys(manifest.icons).sort(), Object.keys(expected).sort());
  for (const [size, relative] of Object.entries(manifest.icons)) {
    assert.ok(fs.existsSync(path.join(root, relative)), `Missing manifest icon: ${relative}`);
    assert.deepEqual(pngDimensions(relative), { width: expected[size], height: expected[size] });
  }
  for (const [size, relative] of Object.entries(manifest.action.default_icon)) {
    assert.equal(relative, manifest.icons[size]);
  }
  const packageScript = read("scripts/package-extension.js");
  for (const relative of Object.values(manifest.icons)) {
    assert.match(packageScript, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("side panel uses semantic, keyboard-accessible, CSP-safe markup", () => {
  const panel = read("panel.html");
  assert.match(panel, /<html\s+lang="en">/);
  assert.match(panel, /<meta\s+name="viewport"/);
  assert.match(panel, /<main>/);
  assert.match(panel, /role="status"[^>]*aria-atomic="true"/);
  assert.match(panel, /role="progressbar"[^>]*aria-valuenow="0"/);
  assert.match(panel, /<dialog\b[^>]*aria-labelledby=/);
  assert.match(panel, /<section\s+class="explanation card"/);
  assert.match(panel, /<details\s+id="technical-details"/);
  assert.match(panel, /<details\s+class="history disclosure card"/);
  assert.match(panel, /<ol\s+id="explanation-steps"[^>]*role="list"/);
  assert.match(panel, /id="record-journey"/);
  assert.match(panel, /<form\s+id="bug-report-form"/);
  assert.match(panel, /<form\s+id="github-form"/);
  assert.match(panel, /id="download-playwright"/);
  assert.match(panel, /<pre\b[^>]*tabindex="0"><code\b/);
  assert.match(panel, /1<[^>]*visually-hidden[^>]*> — Not useful/);
  assert.match(panel, /5<[^>]*visually-hidden[^>]*> — Very useful/);
  assert.match(panel, /1<[^>]*visually-hidden[^>]*> — Very unclear/);
  assert.match(panel, /5<[^>]*visually-hidden[^>]*> — Very clear/);
  assert.doesNotMatch(panel, /<script\b(?![^>]*\bsrc=)/);
  assert.doesNotMatch(panel, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(panel, /\sstyle\s*=/i);
  for (const match of panel.matchAll(/<button\b([^>]*)>/g)) {
    assert.match(match[1], /\btype="(?:button|submit)"/, `Button is missing an explicit type: ${match[0]}`);
  }
});

test("runtime rendering avoids HTML string injection and promise chains", () => {
  const runtime = ["background.js", "content.js", "panel.js", "source-map.js", "framework-adapter.js", "trace-core.js"];
  for (const relative of runtime) {
    const source = read(relative);
    assert.doesNotMatch(source, /\.innerHTML\s*=/, `${relative} assigns innerHTML`);
    assert.doesNotMatch(source, /\.(?:then|catch)\s*\(/, `${relative} uses a promise chain`);
  }
  assert.ok(fs.existsSync(path.join(root, "content.css")));
  assert.doesNotMatch(read("content.js"), /Object\.assign\([^,]+\.style/);
});

test("optional AI explains unsupported browsers and unavailable local models", () => {
  const panelRuntime = read("panel.js");
  assert.match(panelRuntime, /not exposed by this Brave version/);
  assert.match(panelRuntime, /chrome:\/\/on-device-internals/);
  assert.match(panelRuntime, /at least 22 GB free/);
  assert.match(panelRuntime, /deterministic explanation above remains fully available/);
});

test("Web Store and privacy documentation cover every requested capability", () => {
  const webStore = read("CHROMEWEBSTORE.md");
  for (const permission of [...manifest.permissions, "optional", "privacy", "reviewer", "single purpose"]) {
    assert.match(webStore.toLowerCase(), new RegExp(permission.toLowerCase()));
  }
  assert.match(read("PRIVACY.md"), /chrome\.storage\.session/);
});

test("public beta site is accessible, CSP-safe, and ships complete media", () => {
  const landing = read("beta-site/index.html");
  const privacy = read("beta-site/privacy.html");
  const css = read("beta-site/styles.css");

  for (const page of [landing, privacy]) {
    assert.match(page, /<html\s+lang="en">/);
    assert.match(page, /<meta\s+name="viewport"/);
    assert.match(page, /<main\b/);
    assert.doesNotMatch(page, /<script\b(?![^>]*\bsrc=)/);
    assert.doesNotMatch(page, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(page, /\sstyle\s*=/i);
  }
  assert.match(landing, /class="skip-link"/);
  assert.match(landing, /<video\b[^>]*\bcontrols\b[^>]*\bwidth="1280"[^>]*\bheight="720"[^>]*\bpreload="none"/);
  assert.match(landing, /<track\b[^>]*kind="captions"[^>]*\bdefault/);
  assert.match(landing, /video has no narration/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /forced-colors:\s*active/);

  assert.deepEqual(pngDimensions("store-assets/store-screenshot-failure.png"), { width: 1280, height: 800 });
  assert.deepEqual(pngDimensions("store-assets/store-screenshot-success.png"), { width: 1280, height: 800 });
  assert.deepEqual(pngDimensions("store-assets/store-screenshot-report.png"), { width: 1280, height: 800 });
  assert.deepEqual(pngDimensions("store-assets/small-promo-tile.png"), { width: 440, height: 280 });
  assert.ok(fs.statSync(path.join(root, "beta-site/assets/consolehawk-walkthrough.webm")).size > 100_000);
  assert.ok(fs.existsSync(path.join(root, ".github/ISSUE_TEMPLATE/guided-beta-session.yml")));
  assert.ok(fs.existsSync(path.join(root, "BETA_STUDY_PROTOCOL.md")));
  assert.ok(fs.existsSync(path.join(root, "OUTREACH_SCORECARD.md")));
});

test("product and tester documentation stays English", () => {
  const markdownFiles = fs.readdirSync(root).filter((filename) => filename.endsWith(".md"));
  const danishMarkers = /[æøå]|\b(?:hej|tak|søger|vigtigt|du har|du skal|jeg søger|start her)\b/i;
  for (const filename of markdownFiles) {
    assert.doesNotMatch(read(filename), danishMarkers, `${filename} contains Danish product-facing text`);
  }
  assert.ok(fs.existsSync(path.join(root, "START_HERE.md")));
  assert.match(read("scripts/package-beta-kit.js"), /"START_HERE\.md"/);
  assert.match(read("scripts/package-beta-kit.js"), /"LICENSE\.md"/);
  assert.doesNotMatch(read("scripts/package-beta-kit.js"), /START_HER\.md/);
  assert.ok(fs.existsSync(path.join(root, "QUICK_TEST.md")));
  assert.ok(fs.existsSync(path.join(root, "PROMOTION_KIT.md")));
  assert.ok(fs.existsSync(path.join(root, "assets", "consolehawk-social-preview.png")));
});

test("public beta surfaces use the current release and safe reporting guidance", () => {
  const panel = read("panel.html");
  const publicBetaDocs = [
    "README.md",
    "START_HERE.md",
    "BETA.md",
    "BETA_TEST_GUIDE.md",
    "BETA_FEEDBACK_FORM.md",
    "BETA_RELEASE_NOTES.md",
    "GITHUB_SHARING_GUIDE.md",
    "TESTER_RECRUITMENT.md",
    "CHROMEWEBSTORE.md",
  ].map(read).join("\n");

  assert.match(panel, /CONSOLEHAWK · PUBLIC BETA/);
  assert.doesNotMatch(panel, /PRIVATE BETA/i);
  assert.match(publicBetaDocs, /v0\.11\.1-beta\.1/);
  assert.match(publicBetaDocs, /private vulnerability reporting/i);
  assert.doesNotMatch(publicBetaDocs, /private[- ]beta/i);
  assert.doesNotMatch(publicBetaDocs, /v0\.11\.0-beta\.[123]/);
});

test("beta study separates installation friction and measures understanding before and after the trace", () => {
  const guide = read("BETA_TEST_GUIDE.md");
  const quickTest = read("QUICK_TEST.md");
  const feedbackForm = read("BETA_FEEDBACK_FORM.md");
  const issueForm = read(".github/ISSUE_TEMPLATE/beta-feedback.yml");

  for (const document of [guide, quickTest, feedbackForm, issueForm]) {
    assert.match(document, /installation/i);
    assert.match(document, /before.*after|before versus after/i);
  }
  assert.match(guide, /what you would inspect first in DevTools/i);
  assert.match(quickTest, /mainly added another artifact/i);
  assert.match(issueForm, /id: installation_friction/);
  assert.match(issueForm, /id: before_after/);
});
