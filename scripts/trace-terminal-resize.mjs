#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const traceDir =
  process.env.VUE_TUI_TERMINAL_RESIZE_TRACE_DIR || "/tmp/vue-tui-terminal-resize-trace";

const targets = {
  showcase: ["pnpm", ["run", "showcase:terminal"]],
  katex: ["pnpm", ["run", "run:katex-showcase:terminal"]],
  image: ["pnpm", ["run", "run:image-showcase:terminal"]],
};

const cliArgs = process.argv.slice(2);
if (cliArgs[0] === "--") cliArgs.shift();
const target = cliArgs[0] || "showcase";

if (target === "-h" || target === "--help" || !Object.hasOwn(targets, target)) {
  const names = Object.keys(targets).join(", ");
  console.error(`Usage: pnpm run trace:terminal-resize -- [${names}]`);
  console.error(`Logs are reset and written under ${traceDir}`);
  process.exit(target === "-h" || target === "--help" ? 0 : 1);
}

rmSync(traceDir, { recursive: true, force: true });
mkdirSync(traceDir, { recursive: true });

const renderLogPath = join(traceDir, "render-debug.log");
const framePerfPath = join(traceDir, "frame-perf.jsonl");
const profileLogPath = join(traceDir, "profile.log");
const [command, args] = targets[target];

writeFileSync(
  join(traceDir, "meta.json"),
  `${JSON.stringify(
    {
      target,
      command,
      args,
      startedAt: new Date().toISOString(),
      renderLogPath,
      framePerfPath,
      profileLogPath,
    },
    null,
    2,
  )}\n`,
);

console.error(`[trace] cleared ${traceDir}`);
console.error(`[trace] target=${target}`);
console.error(`[trace] command=${command} ${args.join(" ")}`);
console.error(`[trace] render log=${renderLogPath}`);
console.error(`[trace] frame perf=${framePerfPath}`);
console.error("[trace] reproduce the resize issue, then press Ctrl+C");

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VUE_TUI_DEBUG: "1",
    VUE_TUI_DEBUG_LOG_PATH: renderLogPath,
    VUE_TUI_PROFILE: "1",
    VUE_TUI_PROFILE_LOG_PATH: profileLogPath,
    VUE_TUI_FRAME_PERF_LOG_PATH: framePerfPath,
  },
  stdio: "inherit",
});

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", forwardSignal);
process.on("SIGTERM", forwardSignal);

child.on("exit", (code, signal) => {
  process.off("SIGINT", forwardSignal);
  process.off("SIGTERM", forwardSignal);
  console.error(`[trace] exited${signal ? ` by ${signal}` : ` with code ${code ?? 0}`}`);
  console.error(`[trace] logs remain in ${traceDir}`);
  process.exit(code ?? (signal ? 130 : 0));
});

child.on("error", (error) => {
  console.error(`[trace] failed to start: ${error.message}`);
  process.exit(1);
});
