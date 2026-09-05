const packageJson = require("../package.json");

const actual = process.argv[2];
const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const expected = new RegExp(`^v${escapedVersion}(?:-beta\\.[1-9][0-9]*)?$`);
if (!expected.test(actual || "")) {
  throw new Error(
    `Release tag ${actual || "(missing)"} must be v${packageJson.version} or v${packageJson.version}-beta.N.`,
  );
}
process.stdout.write(`Release tag ${actual} matches the package version.\n`);
