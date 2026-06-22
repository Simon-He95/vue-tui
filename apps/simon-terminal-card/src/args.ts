import process from "node:process";
import { defaultUser } from "./constants.js";

function readArgOption(argv: readonly string[], name: string): string | null {
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === name) {
      const value = argv[index + 1];
      return value && !value.startsWith("--") ? value : null;
    }
    if (arg?.startsWith(prefix)) return arg.slice(prefix.length) || null;
  }
  return null;
}

export function readOption(name: string): string | null {
  return readArgOption(process.argv.slice(2), name);
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function normalizeUsernameArg(value: string | null | undefined): string | null {
  const username = String(value ?? "")
    .trim()
    .replace(/^@/u, "");
  return username || null;
}

function hasLaterPositionalArg(argv: readonly string[], startIndex: number): boolean {
  for (let index = startIndex; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--user" || arg === "--out") {
      index++;
      continue;
    }
    if (arg.startsWith("--user=") || arg.startsWith("--out=") || arg.startsWith("--")) continue;
    return true;
  }
  return false;
}

export function resolveUsernameArg(argv: readonly string[] = process.argv.slice(2)): string {
  const flagged = normalizeUsernameArg(readArgOption(argv, "--user"));
  if (flagged) return flagged;

  let sawPositional = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--user" || arg === "--out") {
      index++;
      continue;
    }
    if (arg.startsWith("--user=") || arg.startsWith("--out=") || arg.startsWith("--")) continue;
    if (!sawPositional && arg === "terminal-card" && hasLaterPositionalArg(argv, index + 1))
      continue;
    sawPositional = true;
    const username = normalizeUsernameArg(arg);
    if (username) return username;
  }

  return defaultUser;
}
