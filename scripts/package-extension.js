const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const destination = path.join(root, "dist");
const files = [
  "manifest.json",
  "background.js",
  "content.js",
  "trace-core.js",
  "source-map.js",
  "framework-adapter.js",
  "panel.html",
  "panel.js",
  "panel.css",
  "vendor/trace-mapping.js",
  "vendor/TRACE_MAPPING_LICENSE.txt"
];

fs.rmSync(destination, { recursive: true, force: true });
for (const relative of files) {
  const source = path.join(root, relative);
  const target = path.join(destination, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
process.stdout.write(`Packaged ${files.length} runtime files in ${destination}\n`);
