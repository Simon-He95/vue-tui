import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const inputArg = args.indexOf("--input");
if (inputArg >= 0 && !args[inputArg + 1]) {
  throw new Error(
    "Usage: node scripts/fix-vue-dts-compat.mjs [--input <dir>] [--stdout] [--check]",
  );
}
const inputDir = resolve(inputArg >= 0 ? args[inputArg + 1] : "dist");
const stdout = args.includes("--stdout");
const check = args.includes("--check");
if (stdout && check) {
  throw new Error("--stdout and --check cannot be used together");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

function isIdentifierChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch);
}

function matchingAngle(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escape = false;

  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "<") {
      depth++;
      continue;
    }
    if (ch === ">" && source[i - 1] !== "=") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function splitTopLevelArgs(source) {
  const args = [];
  let start = 0;
  let angle = 0;
  let brace = 0;
  let bracket = 0;
  let paren = 0;
  let quote = null;
  let escape = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "<") angle++;
    else if (ch === ">" && source[i - 1] !== "=") angle--;
    else if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;
    else if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "," && angle === 0 && brace === 0 && bracket === 0 && paren === 0) {
      args.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }

  args.push(source.slice(start).trim());
  return args;
}

function trimTypeArguments(source, target, maxArgs) {
  let out = "";
  let index = 0;
  const needle = `${target}<`;

  while (index < source.length) {
    const pos = source.indexOf(needle, index);
    if (pos < 0) {
      out += source.slice(index);
      break;
    }

    const before = source[pos - 1] ?? "";
    if (isIdentifierChar(before)) {
      out += source.slice(index, pos + target.length);
      index = pos + target.length;
      continue;
    }

    const open = pos + target.length;
    const close = matchingAngle(source, open);
    if (close < 0) {
      out += source.slice(index);
      break;
    }

    const inner = source.slice(open + 1, close);
    const args = splitTopLevelArgs(inner);
    const nextInner = args.length > maxArgs ? args.slice(0, maxArgs).join(", ") : inner;
    out += source.slice(index, open + 1) + nextInner + ">";
    index = close + 1;
  }

  return out;
}

function importsNamedVueType(source, name) {
  const importPattern = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']vue["']/g;
  let match;

  while ((match = importPattern.exec(source))) {
    const specifiers = match[1].split(",");
    for (const specifier of specifiers) {
      const cleaned = specifier.trim().replace(/^type\s+/, "");
      const [imported, local = imported] = cleaned.split(/\s+as\s+/);
      if (imported?.trim() === name && local?.trim() === name) return true;
    }
  }

  return false;
}

function patchDts(source) {
  let out = trimTypeArguments(source, 'import("vue").DefineComponent', 13);
  out = trimTypeArguments(out, "DefineComponent", 13);
  out = trimTypeArguments(out, 'import("vue").Ref', 1);
  if (importsNamedVueType(source, "Ref")) {
    out = trimTypeArguments(out, "Ref", 1);
  }
  return out.replaceAll(
    'import("vue").PublicProps',
    '(import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps)',
  );
}

const changed = [];

for (const file of walk(inputDir).sort()) {
  const before = readFileSync(file, "utf8");
  const after = patchDts(before);
  if (stdout) {
    process.stdout.write(after);
    continue;
  }
  if (after === before) continue;

  if (!/DefineComponent|PublicProps|import\("vue"\)\.Ref|\bRef</.test(before)) {
    throw new Error(`Unexpected d.ts rewrite target: ${file}`);
  }

  changed.push(file);
  if (!check) writeFileSync(file, after);
}

if (process.env.VUE_TUI_DEBUG_DTS_PATCH === "1") {
  for (const file of changed) console.log(`[dts-patch] ${file}`);
}

if (check && changed.length > 0) {
  throw new Error(`Vue d.ts compatibility patch is not applied:\n${changed.join("\n")}`);
}
