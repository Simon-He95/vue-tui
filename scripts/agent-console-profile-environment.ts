import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpus, platform, arch, release, totalmem } from "node:os";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function sha256(path: string): string | null {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return null;
  return createHash("sha256").update(readFileSync(absolute)).digest("hex");
}
function filesBelow(path: string): string[] {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return [];
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) =>
    filesBelow(resolve(absolute, entry.name)),
  );
}
export function hashFileTree(paths: readonly string[]): string {
  const hash = createHash("sha256");
  for (const file of paths
    .flatMap(filesBelow)
    .filter(
      (file) =>
        file.endsWith(".js") ||
        file.endsWith(".map") ||
        file.endsWith(".html") ||
        file.endsWith(".json"),
    )
    .sort()) {
    hash.update(relative(process.cwd(), file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}
export const AGENT_CONSOLE_MEASUREMENT_INPUTS = [
  "examples/agent-console/src/AgentConsoleSurface.ts",
  "examples/agent-console/src/App.vue",
  "examples/agent-console/src/main.ts",
  "examples/agent-console/src/markdown-publication-controller.ts",
  "examples/agent-console/src/mock-agent-stream.ts",
  "examples/agent-console/src/perf-browser-harness.ts",
  "examples/agent-console/src/perf-harness.ts",
  "examples/agent-console/src/transcript-store.ts",
  "examples/agent-console/vite.config.ts",
  "scripts/profile-agent-console-abc.ts",
  "scripts/profile-agent-console-browser.ts",
  "scripts/profile-agent-console-cli-worker.ts",
  "scripts/profile-agent-console-cli.ts",
  "scripts/tsconfig.agent-console-profile-dist.json",
] as const;
export const AGENT_CONSOLE_VERIFICATION_INPUTS = [
  "scripts/agent-console-cpu-profile.ts",
  "scripts/agent-console-profile-environment.ts",
  "scripts/agent-console-profile-stats.ts",
  "scripts/check-agent-console-profile-baseline.ts",
  "scripts/record-agent-console-profile.ts",
  "scripts/summarize-agent-console-profile.ts",
  "scripts/validate-agent-console-abc.ts",
] as const;
function hashes(paths: readonly string[]) {
  return Object.fromEntries(paths.map((path) => [path, sha256(path)]));
}
export function inputHashesAtRef(ref: string, paths: readonly string[]) {
  return Object.fromEntries(
    paths.map((path) => {
      try {
        const content = execFileSync("git", ["show", `${ref}:${path}`]);
        return [path, createHash("sha256").update(content).digest("hex")];
      } catch {
        return [path, null];
      }
    }),
  );
}
export const measurementInputHashes = () => hashes(AGENT_CONSOLE_MEASUREMENT_INPUTS);
export const verificationInputHashes = () => hashes(AGENT_CONSOLE_VERIFICATION_INPUTS);
/** Compatibility aggregate for callers outside the profile recorder. */
export const profileInputHashes = () => ({
  ...measurementInputHashes(),
  ...verificationInputHashes(),
});
export function agentConsoleProfileEnvironment(
  artifacts: readonly string[],
  trees: readonly string[] = [],
) {
  return {
    commit: git(["rev-parse", "HEAD"]),
    dirty: Boolean(git(["status", "--porcelain"])),
    node: process.version,
    v8: process.versions.v8,
    os: { platform: platform(), arch: arch(), release: release(), totalMemory: totalmem() },
    cpu: { model: cpus()[0]?.model ?? "unknown", cores: cpus().length },
    artifactHashes: Object.fromEntries(artifacts.map((path) => [path, sha256(path)])),
    artifactTreeHash: hashFileTree(trees),
    measurementInputs: measurementInputHashes(),
  };
}
