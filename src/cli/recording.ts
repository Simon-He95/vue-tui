import type { TerminalEventRecord } from "../events/recording.js";

async function loadFs(): Promise<typeof import("fs")> {
  return import("node:fs");
}

export async function writeEventLog(
  path: string,
  events: readonly TerminalEventRecord[],
): Promise<void> {
  const { writeFileSync } = await loadFs();
  const lines = events.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(path, `${lines}${lines ? "\n" : ""}`, "utf8");
}

export async function writeSnapshot(path: string, lines: readonly string[]): Promise<void> {
  const { writeFileSync } = await loadFs();
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

export async function readEventLog(path: string): Promise<TerminalEventRecord[]> {
  const { readFileSync } = await loadFs();
  const raw = readFileSync(path, "utf8");
  const out: TerminalEventRecord[] = [];
  for (const line of raw.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed));
  }
  return out;
}
