import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const releaseDir = ".release";
const tarballs = readdirSync(releaseDir)
  .filter((file) => file.endsWith(".tgz"))
  .map((file) => join(releaseDir, file));

if (tarballs.length !== 1) {
  throw new Error(
    `Expected exactly one package tarball, found ${tarballs.length}:\n${tarballs.join("\n")}`,
  );
}

execFileSync("npm", ["publish", tarballs[0], "--access", "public", "--provenance"], {
  stdio: "inherit",
});
