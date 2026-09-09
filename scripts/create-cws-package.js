const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const dist = path.join(root, "dist");
const outputDirectory = path.join(root, "artifacts");
const output = path.join(outputDirectory, `reprolens-cws-v${manifest.version}.zip`);

if (!fs.existsSync(path.join(dist, "manifest.json"))) {
  throw new Error("Build the extension before creating the Chrome Web Store package.");
}

fs.mkdirSync(outputDirectory, { recursive: true });
fs.rmSync(output, { force: true });
const result = spawnSync("zip", ["-q", "-r", output, "."], {
  cwd: dist,
  encoding: "utf8"
});
if (result.status !== 0) {
  throw new Error(result.stderr || "Could not create the Chrome Web Store ZIP.");
}

process.stdout.write(`Created ${output}\n`);
