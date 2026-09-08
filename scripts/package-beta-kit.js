const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const testerFiles = [
  "START_HERE.md",
  "BETA_TEST_GUIDE.md",
  "BETA_BUG_REPORT.md",
  "BETA_FEEDBACK_FORM.md",
];

if (!fs.existsSync(path.join(output, "manifest.json"))) {
  throw new Error("Build the extension before packaging the beta tester kit.");
}

for (const filename of testerFiles) {
  fs.copyFileSync(path.join(root, filename), path.join(output, filename));
}

process.stdout.write(`Added ${testerFiles.length} tester files to ${output}\n`);
