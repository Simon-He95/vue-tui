const { execFileSync } = require("node:child_process");

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);

const bad = files.filter(
  (file) =>
    /(^|\/)dist(-[^/]+)?\//.test(file) ||
    file.startsWith(".release/") ||
    file.startsWith(".tmp/") ||
    file.startsWith("test-results/"),
);

if (bad.length) {
  console.error("Tracked generated output is not allowed:");
  for (const file of bad) console.error(`  ${file}`);
  process.exit(1);
}
