import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tarball = process.argv[2];
if (!tarball) {
  throw new Error("Usage: node scripts/smoke-packed-no-mermaid-peer.mjs .release/*.tgz");
}

const dir = mkdtempSync(join(tmpdir(), "vue-tui-no-mermaid-peer-"));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: dir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

try {
  run("npm", ["init", "-y"]);
  run("npm", ["install", "--no-audit", "--no-fund", resolve(tarball), "vue@^3"]);

  writeFileSync(
    join(dir, "esm.mjs"),
    `
      import * as root from "@simon_he/vue-tui";
      import * as vue from "@simon_he/vue-tui/vue";
      import * as agent from "@simon_he/vue-tui/agent";

      if (!root.createTerminal) throw new Error("root import failed");
      if (!vue.TMermaidText) throw new Error("vue Mermaid primitive missing");
      if (!agent.TMermaidText) throw new Error("agent Mermaid primitive missing");
      console.log("esm no beautiful-mermaid peer ok");
    `,
  );

  writeFileSync(
    join(dir, "cjs.cjs"),
    `
      const root = require("@simon_he/vue-tui");
      const vue = require("@simon_he/vue-tui/vue");
      const agent = require("@simon_he/vue-tui/agent");

      if (!root.createTerminal) throw new Error("root require failed");
      if (!vue.TMermaidText) throw new Error("vue Mermaid primitive missing");
      if (!agent.TMermaidText) throw new Error("agent Mermaid primitive missing");
      console.log("cjs no beautiful-mermaid peer ok");
    `,
  );

  run("node", ["esm.mjs"]);
  run("node", ["cjs.cjs"]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
