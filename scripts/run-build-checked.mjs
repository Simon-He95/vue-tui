import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";

mkdirSync(".tmp", { recursive: true });

const log = createWriteStream(".tmp/build.log");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function exitAfterLogFlush(code) {
  log.end(() => {
    process.exit(code);
  });
}

const child = spawn(pnpm, ["run", "build"], {
  stdio: ["inherit", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  log.write(chunk);
});

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  log.write(chunk);
});

child.on("error", (error) => {
  console.error(error);
  exitAfterLogFlush(1);
});

child.on("close", (code) => {
  exitAfterLogFlush(code ?? 1);
});
