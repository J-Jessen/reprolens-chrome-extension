const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const packageJson = require("../package.json");
const script = path.join(__dirname, "..", "scripts", "check-release-tag.js");

function checkTag(tag) {
  return spawnSync(process.execPath, [script, tag], { encoding: "utf8" });
}

test("accepts the stable tag for the package version", () => {
  assert.equal(checkTag(`v${packageJson.version}`).status, 0);
});

test("accepts numbered beta tags for the package version", () => {
  assert.equal(checkTag(`v${packageJson.version}-beta.1`).status, 0);
  assert.equal(checkTag(`v${packageJson.version}-beta.12`).status, 0);
});

test("rejects malformed or mismatched tags", () => {
  for (const tag of [
    `${packageJson.version}`,
    `v${packageJson.version}-beta.0`,
    `v${packageJson.version}-beta`,
    "v99.0.0-beta.1",
  ]) {
    assert.notEqual(checkTag(tag).status, 0, tag);
  }
});
