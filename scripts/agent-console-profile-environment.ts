import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpus, platform, arch, release, totalmem } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function sha256(path: string): string | null {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return null;
  return createHash("sha256").update(readFileSync(absolute)).digest("hex");
}
export function agentConsoleProfileEnvironment(artifacts: readonly string[]) {
  return {
    commit: git(["rev-parse", "HEAD"]),
    dirty: Boolean(git(["status", "--porcelain"])),
    node: process.version,
    v8: process.versions.v8,
    os: { platform: platform(), arch: arch(), release: release(), totalMemory: totalmem() },
    cpu: { model: cpus()[0]?.model ?? "unknown", cores: cpus().length },
    artifactHashes: Object.fromEntries(artifacts.map((path) => [path, sha256(path)])),
  };
}
