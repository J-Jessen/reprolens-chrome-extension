const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const manifest = JSON.parse(read("manifest.json"));

test("manifest follows the extension's Chrome 118+ permission policy", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(Number.parseInt(manifest.minimum_chrome_version, 10) >= 118);
  assert.deepEqual(manifest.permissions.sort(), ["debugger", "scripting", "sidePanel", "storage", "tabs"].sort());
  assert.deepEqual(manifest.optional_host_permissions.sort(), ["http://*/*", "https://*/*"].sort());
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.side_panel.default_path, "panel.html");
  assert.equal(manifest.action.default_title, "Open Behaviour Tracer");
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
  assert.match(panel, /<pre\b[^>]*tabindex="0"><code\b/);
  assert.doesNotMatch(panel, /<script\b(?![^>]*\bsrc=)/);
  assert.doesNotMatch(panel, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(panel, /\sstyle\s*=/i);
  for (const match of panel.matchAll(/<button\b([^>]*)>/g)) {
    assert.match(match[1], /\btype="button"/, `Button is missing type=button: ${match[0]}`);
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

test("Web Store and privacy documentation cover every requested capability", () => {
  const webStore = read("CHROMEWEBSTORE.md");
  for (const permission of [...manifest.permissions, "optional", "privacy", "reviewer", "single purpose"]) {
    assert.match(webStore.toLowerCase(), new RegExp(permission.toLowerCase()));
  }
  assert.match(read("PRIVACY.md"), /chrome\.storage\.session/);
});
