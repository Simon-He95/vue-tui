import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dist = resolve("dist");

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

for (const file of walk(dist)) {
  const before = readFileSync(file, "utf8");
  let after = trimTypeArguments(before, 'import("vue").DefineComponent', 13);
  after = trimTypeArguments(after, "DefineComponent", 13);
  after = trimTypeArguments(after, 'import("vue").Ref', 1);
  after = trimTypeArguments(after, "Ref", 1);
  after = after.replaceAll(
    'import("vue").PublicProps',
    '(import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps)',
  );
  if (after !== before) writeFileSync(file, after);
}
