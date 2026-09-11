const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "beta-site");
const destination = path.join(root, "site-dist");
const demoSource = path.join(root, "demo");
const storeAssets = path.join(root, "store-assets");

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
fs.cpSync(demoSource, path.join(destination, "demo"), { recursive: true });

const assetDestination = path.join(destination, "assets");
const iconDestination = path.join(destination, "icons");
fs.mkdirSync(assetDestination, { recursive: true });
fs.mkdirSync(iconDestination, { recursive: true });
for (const filename of ["consolehawk-icon-32.png", "consolehawk-icon-48.png"]) {
  fs.copyFileSync(path.join(root, "icons", filename), path.join(assetDestination, filename));
}
fs.copyFileSync(path.join(root, "icons", "consolehawk-icon-32.png"), path.join(iconDestination, "consolehawk-icon-32.png"));
for (const filename of ["store-screenshot-failure.png", "store-screenshot-report.png"]) {
  fs.copyFileSync(path.join(storeAssets, filename), path.join(assetDestination, filename));
}

const required = [
  "index.html",
  "privacy.html",
  "styles.css",
  "walkthrough.vtt",
  "assets/consolehawk-walkthrough.webm",
  "assets/store-screenshot-failure.png",
  "icons/consolehawk-icon-32.png",
  "demo/index.html",
  "demo/failure.html",
  "demo/multi-step.html"
];
for (const relative of required) {
  if (!fs.existsSync(path.join(destination, relative))) {
    throw new Error(`Missing public beta site file: ${relative}`);
  }
}

process.stdout.write(`Built the public beta site in ${destination}\n`);
