const packageJson = require("../package.json");

const actual = process.argv[2];
const expected = `v${packageJson.version}`;
if (actual !== expected) {
  throw new Error(`Release tag ${actual || "(missing)"} does not match ${expected}.`);
}
process.stdout.write(`Release tag ${actual} matches the package version.\n`);
