const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const versions = [packageJson.version, lock.version, lock.packages?.[""]?.version, manifest.version];

if (!versions.every((version) => version === packageJson.version)) {
  throw new Error(`Version mismatch: ${versions.join(", ")}`);
}
if (!readme.includes(`Current build: **${packageJson.version}**`)) {
  throw new Error(`README does not identify current build ${packageJson.version}`);
}
process.stdout.write(`Version ${packageJson.version} is consistent.\n`);
