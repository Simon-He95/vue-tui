import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

type Maturity = "public" | "advanced" | "experimental";
type Component = {
  maturity: Maturity;
  props: Array<{ name: string; type: string; required: boolean; deprecated?: string }>;
  events: Array<{ name: string; payload?: string }>;
};
type ApiManifest = {
  entrypoints: Record<string, { maturity: Maturity; exports: string[] }>;
  components: Record<string, Component>;
};

function readCurrent(): ApiManifest {
  return JSON.parse(readFileSync("docs/generated/api-manifest.json", "utf8")) as ApiManifest;
}

function readBaseFromArg(): ApiManifest | null {
  const baseIndex = process.argv.indexOf("--base");
  if (baseIndex < 0) return null;
  const file = process.argv[baseIndex + 1];
  if (!file) throw new Error("--base requires a manifest path");
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  return JSON.parse(readFileSync(file, "utf8")) as ApiManifest;
}

function readBaseFromLatestTag(): ApiManifest | null {
  try {
    const tag = execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!tag) return null;
    const text = execFileSync("git", ["show", `${tag}:docs/generated/api-manifest.json`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(text) as ApiManifest;
  } catch {
    return null;
  }
}

const current = readCurrent();
const base = readBaseFromArg() ?? readBaseFromLatestTag();
if (!base) {
  console.log("api:diff skipped: no base manifest found in --base or latest git tag");
  process.exit(0);
}

const breaking: string[] = [];
const notes: string[] = [];

for (const [specifier, previous] of Object.entries(base.entrypoints)) {
  const next = current.entrypoints[specifier];
  if (!next) {
    if (previous.maturity === "public") breaking.push(`${specifier} entrypoint was removed`);
    else notes.push(`${specifier} entrypoint was removed`);
    continue;
  }
  const nextExports = new Set(next.exports);
  for (const name of previous.exports) {
    if (nextExports.has(name)) continue;
    const line = `${specifier}.${name} export was removed`;
    if (previous.maturity === "public") breaking.push(line);
    else notes.push(line);
  }
}

for (const [name, previous] of Object.entries(base.components)) {
  const next = current.components[name];
  if (!next) {
    if (previous.maturity === "public") breaking.push(`${name} component was removed`);
    else notes.push(`${name} component was removed`);
    continue;
  }

  const nextProps = new Map(next.props.map((prop) => [prop.name, prop]));
  for (const prop of previous.props) {
    const nextProp = nextProps.get(prop.name);
    if (!nextProp) {
      if (previous.maturity === "public") breaking.push(`${name}.${prop.name} prop was removed`);
      else notes.push(`${name}.${prop.name} prop was removed`);
      continue;
    }
    if (prop.type !== nextProp.type) {
      const line = `${name}.${prop.name} changed type ${prop.type} -> ${nextProp.type}`;
      if (previous.maturity === "public") breaking.push(line);
      else notes.push(line);
    }
    if (prop.required !== nextProp.required) {
      const line = `${name}.${prop.name} changed required ${prop.required} -> ${nextProp.required}`;
      if (previous.maturity === "public") breaking.push(line);
      else notes.push(line);
    }
  }

  const nextEvents = new Map(next.events.map((event) => [event.name, event]));
  for (const event of previous.events) {
    const nextEvent = nextEvents.get(event.name);
    if (!nextEvent) {
      if (previous.maturity === "public") breaking.push(`${name}.${event.name} event was removed`);
      else notes.push(`${name}.${event.name} event was removed`);
      continue;
    }
    if ((event.payload ?? "") !== (nextEvent.payload ?? "")) {
      const line = `${name}.${event.name} changed payload ${event.payload ?? "-"} -> ${
        nextEvent.payload ?? "-"
      }`;
      if (previous.maturity === "public") breaking.push(line);
      else notes.push(line);
    }
  }
}

if (breaking.length) {
  console.error("Breaking API changes:");
  for (const item of breaking) console.error(`- ${item}`);
}

if (notes.length) {
  console.log("Non-public API changes:");
  for (const item of notes) console.log(`- ${item}`);
}

if (breaking.length) process.exit(1);
if (!notes.length) console.log("No API drift detected.");
