import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

type Maturity = "public" | "advanced" | "experimental";
type EntrypointRuntime = "browser-safe" | "node-only" | "mixed";
type Component = {
  entrypoint: string;
  maturity: Maturity;
  props: Array<{
    name: string;
    type: string;
    required: boolean;
    defaultValue?: string;
    deprecated?: string;
  }>;
  events: Array<{ name: string; payload?: string }>;
  slots?: Array<{ name: string; props?: string }>;
  exposed?: Array<{ name: string; type: string }>;
};
type Entrypoint = {
  maturity: Maturity;
  runtime?: EntrypointRuntime;
  valueExports?: string[];
  typeExports?: string[];
  exports?: string[];
};
type ApiManifest = {
  entrypoints: Record<string, Entrypoint>;
  components: Record<string, Component>;
};

function readCurrent(): ApiManifest {
  return JSON.parse(readFileSync("docs/generated/api-manifest.json", "utf8")) as ApiManifest;
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

function readBaseFromArg(): ApiManifest | null {
  const file = readArg("--base");
  if (!file) return null;
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  return JSON.parse(readFileSync(file, "utf8")) as ApiManifest;
}

function readBaseRefFromArgOrEnv(): string | null {
  const explicit = readArg("--base-ref") ?? process.env.VUE_TUI_API_DIFF_BASE_REF ?? null;
  if (explicit?.trim()) return explicit.trim();
  return null;
}

function refHasManifest(ref: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}:docs/generated/api-manifest.json`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function readBaseFromRef(ref: string): ApiManifest {
  const text = execFileSync("git", ["show", `${ref}:docs/generated/api-manifest.json`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(text) as ApiManifest;
}

function headTags(): string[] {
  try {
    return execFileSync("git", ["tag", "--points-at", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function latestComparableTag(): string | null {
  try {
    const args = ["describe", "--tags", "--abbrev=0"];
    for (const tag of headTags()) args.push("--exclude", tag);
    const tag = execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return tag || null;
  } catch {
    return null;
  }
}

function changedFilesSince(ref: string): string[] {
  const attempts: string[][] = [
    ["diff", "--name-only", `${ref}...HEAD`],
    ["diff", "--name-only", `${ref}..HEAD`],
  ];

  for (const args of attempts) {
    try {
      const out = execFileSync("git", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      // Try the next diff form. Some local/tag situations may not have a merge base.
    }
  }

  return [];
}

function isApiReviewNoteFile(file: string): boolean {
  return (
    file === "CHANGELOG.md" ||
    file === "docs/release-candidate.md" ||
    file === "docs/api-maturity.md" ||
    /^docs\/migration-[^/]+\.md$/u.test(file)
  );
}

function hasApiReviewMarker(file: string): boolean {
  if (!existsSync(file)) return false;
  const text = readFileSync(file, "utf8");
  return /<!--\s*vue-tui-api-diff-reviewed\s*-->|API diff reviewed|API change note/u.test(text);
}

function hasNonPublicApiReviewNote(ref: string | null): boolean {
  if (process.env.VUE_TUI_API_DIFF_ALLOW_NOTES === "1") return true;
  if (!ref) return false;

  const files = changedFilesSince(ref);
  return files.some((file) => isApiReviewNoteFile(file) && hasApiReviewMarker(file));
}

function tagHasManifest(tag: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${tag}:docs/generated/api-manifest.json`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function readBaseFromTag(tag: string): ApiManifest {
  const text = execFileSync("git", ["show", `${tag}:docs/generated/api-manifest.json`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(text) as ApiManifest;
}

const current = readCurrent();
const argBase = readBaseFromArg();
const baseRef = argBase ? null : readBaseRefFromArgOrEnv();
const baseRefIncludesManifest = baseRef ? refHasManifest(baseRef) : false;
const refBase = baseRef && baseRefIncludesManifest ? readBaseFromRef(baseRef) : null;
const tag = argBase || baseRef ? null : latestComparableTag();
const nonPublicReviewBaseRef = argBase ? null : (baseRef ?? tag ?? null);
const nonPublicApiReviewNotePresent = hasNonPublicApiReviewNote(nonPublicReviewBaseRef);
const tagIncludesManifest = tag ? tagHasManifest(tag) : false;
const base = argBase ?? refBase ?? (tag && tagIncludesManifest ? readBaseFromTag(tag) : null);
if (!base) {
  const message = "api:diff missing base manifest";
  if (baseRef && !baseRefIncludesManifest) {
    console.log(`${message}; skipped for first manifest baseline against ${baseRef}`);
    process.exit(0);
  }
  if (!argBase && tag && !tagIncludesManifest) {
    console.log(`${message}; skipped for first manifest baseline after ${tag}`);
    process.exit(0);
  }
  if (process.env.VUE_TUI_API_DIFF_ALLOW_MISSING_BASE === "1") {
    console.log(`${message}; skipped by explicit env`);
    process.exit(0);
  }
  if (!argBase && !tag && process.env.CI !== "true") {
    console.log(`${message}; skipped because no git tag was found outside CI`);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}

const breaking: string[] = [];
const notes: string[] = [];
const reviewRequiredNotes: string[] = [];
const failOnNonPublicNotes =
  process.env.VUE_TUI_API_DIFF_FAIL_ON_NOTES === "1" ||
  (process.env.CI === "true" && process.env.VUE_TUI_API_DIFF_ALLOW_NOTES !== "1");

function addNote(line: string, options: { reviewRequired?: boolean } = {}): void {
  notes.push(line);
  if (options.reviewRequired) reviewRequiredNotes.push(line);
}

function report(maturity: Maturity, line: string): void {
  if (maturity === "public") breaking.push(line);
  else addNote(line, { reviewRequired: true });
}

function reportEntrypointChange(previous: Entrypoint, next: Entrypoint, line: string): void {
  if (previous.maturity === "public" || next.maturity === "public") breaking.push(line);
  else addNote(line, { reviewRequired: true });
}

function valueExports(entrypoint: Entrypoint): readonly string[] {
  return entrypoint.valueExports ?? entrypoint.exports ?? [];
}

function typeExports(entrypoint: Entrypoint): readonly string[] {
  return entrypoint.typeExports ?? [];
}

for (const [specifier, previous] of Object.entries(base.entrypoints)) {
  const next = current.entrypoints[specifier];
  if (!next) {
    report(previous.maturity, `${specifier} entrypoint was removed`);
    continue;
  }
  if (previous.maturity !== next.maturity) {
    reportEntrypointChange(
      previous,
      next,
      `${specifier} entrypoint maturity changed ${previous.maturity} -> ${next.maturity}`,
    );
  }
  if (previous.runtime && previous.runtime !== next.runtime) {
    reportEntrypointChange(
      previous,
      next,
      `${specifier} entrypoint runtime changed ${previous.runtime} -> ${
        next.runtime ?? "unspecified"
      }`,
    );
  }
  const nextValueExports = new Set(valueExports(next));
  for (const name of valueExports(previous)) {
    if (nextValueExports.has(name)) continue;
    const line = `${specifier}.${name} value export was removed`;
    report(previous.maturity, line);
  }
  const nextTypeExports = new Set(typeExports(next));
  for (const name of typeExports(previous)) {
    if (nextTypeExports.has(name)) continue;
    const line = `${specifier}.${name} type export was removed`;
    report(previous.maturity, line);
  }
}

for (const [specifier, next] of Object.entries(current.entrypoints)) {
  const previous = base.entrypoints[specifier];
  if (!previous) {
    addNote(`${specifier} entrypoint was added`);
    continue;
  }

  const previousValueExports = new Set(valueExports(previous));
  for (const name of valueExports(next)) {
    if (previousValueExports.has(name)) continue;
    addNote(`${specifier}.${name} value export was added`);
  }

  const previousTypeExports = new Set(typeExports(previous));
  for (const name of typeExports(next)) {
    if (previousTypeExports.has(name)) continue;
    addNote(`${specifier}.${name} type export was added`);
  }
}

for (const [name, previous] of Object.entries(base.components)) {
  const next = current.components[name];
  if (!next) {
    report(previous.maturity, `${name} component was removed`);
    continue;
  }

  if (previous.entrypoint !== next.entrypoint) {
    const line = `${name} entrypoint changed ${previous.entrypoint} -> ${next.entrypoint}`;
    report(previous.maturity, line);
  }

  if (previous.maturity !== next.maturity) {
    const line = `${name} maturity changed ${previous.maturity} -> ${next.maturity}`;
    report(previous.maturity, line);
  }

  const nextProps = new Map(next.props.map((prop) => [prop.name, prop]));
  const previousProps = new Map(previous.props.map((prop) => [prop.name, prop]));
  for (const prop of previous.props) {
    const nextProp = nextProps.get(prop.name);
    if (!nextProp) {
      report(previous.maturity, `${name}.${prop.name} prop was removed`);
      continue;
    }
    if (prop.type !== nextProp.type) {
      const line = `${name}.${prop.name} changed type ${prop.type} -> ${nextProp.type}`;
      report(previous.maturity, line);
    }
    if (!prop.required && nextProp.required) {
      report(previous.maturity, `${name}.${prop.name} changed required false -> true`);
    } else if (prop.required && !nextProp.required) {
      addNote(`${name}.${prop.name} changed required true -> false`);
    }
    if ((prop.defaultValue ?? "") !== (nextProp.defaultValue ?? "")) {
      const previousDefault = prop.defaultValue ?? "-";
      const nextDefault = nextProp.defaultValue ?? "-";
      report(
        previous.maturity,
        `${name}.${prop.name} changed default ${previousDefault} -> ${nextDefault}`,
      );
    }
  }
  for (const nextProp of next.props) {
    if (previousProps.has(nextProp.name)) continue;
    if (!nextProp.required) continue;
    const line = `${name}.${nextProp.name} required prop was added`;
    report(previous.maturity, line);
  }

  const nextEvents = new Map(next.events.map((event) => [event.name, event]));
  for (const event of previous.events) {
    const nextEvent = nextEvents.get(event.name);
    if (!nextEvent) {
      report(previous.maturity, `${name}.${event.name} event was removed`);
      continue;
    }
    if ((event.payload ?? "") !== (nextEvent.payload ?? "")) {
      const line = `${name}.${event.name} changed payload ${event.payload ?? "-"} -> ${
        nextEvent.payload ?? "-"
      }`;
      report(previous.maturity, line);
    }
  }

  const nextSlots = new Map((next.slots ?? []).map((slot) => [slot.name, slot]));
  for (const slot of previous.slots ?? []) {
    const nextSlot = nextSlots.get(slot.name);
    if (!nextSlot) {
      report(previous.maturity, `${name}.${slot.name} slot was removed`);
      continue;
    }
    if ((slot.props ?? "") !== (nextSlot.props ?? "")) {
      report(
        previous.maturity,
        `${name}.${slot.name} slot props changed ${slot.props ?? "-"} -> ${nextSlot.props ?? "-"}`,
      );
    }
  }

  const nextExposed = new Map((next.exposed ?? []).map((item) => [item.name, item]));
  for (const item of previous.exposed ?? []) {
    const nextItem = nextExposed.get(item.name);
    if (!nextItem) {
      report(previous.maturity, `${name}.${item.name} exposed method was removed`);
      continue;
    }
    if (item.type !== nextItem.type) {
      report(
        previous.maturity,
        `${name}.${item.name} exposed method type changed ${item.type} -> ${nextItem.type}`,
      );
    }
  }
}

for (const [name, next] of Object.entries(current.components)) {
  const previous = base.components[name];
  if (!previous) {
    addNote(`${name} component was added at ${next.entrypoint}`);
    continue;
  }

  const previousProps = new Set(previous.props.map((prop) => prop.name));
  for (const prop of next.props) {
    if (previousProps.has(prop.name)) continue;
    if (prop.required) continue;
    addNote(`${name}.${prop.name} optional prop was added`);
  }

  const previousEvents = new Set(previous.events.map((event) => event.name));
  for (const event of next.events) {
    if (previousEvents.has(event.name)) continue;
    addNote(`${name}.${event.name} event was added`);
  }

  const previousSlots = new Set((previous.slots ?? []).map((slot) => slot.name));
  for (const slot of next.slots ?? []) {
    if (!previousSlots.has(slot.name)) addNote(`${name}.${slot.name} slot was added`);
  }

  const previousExposed = new Set((previous.exposed ?? []).map((item) => item.name));
  for (const item of next.exposed ?? []) {
    if (!previousExposed.has(item.name)) {
      addNote(`${name}.${item.name} exposed method was added`);
    }
  }
}

if (breaking.length) {
  console.error("Breaking API changes:");
  for (const item of breaking) console.error(`- ${item}`);
}

if (notes.length) {
  console.log("API change notes:");
  for (const item of notes) console.log(`- ${item}`);
}

if (breaking.length) process.exit(1);
if (reviewRequiredNotes.length && failOnNonPublicNotes && !nonPublicApiReviewNotePresent) {
  console.error(
    "Non-public API changes require a release note, migration note, API maturity note with an API review marker, or explicit CI override.",
  );
  for (const item of reviewRequiredNotes) console.error(`- ${item}`);
  console.error(
    [
      'Add or update one of these files with <!-- vue-tui-api-diff-reviewed -->, "API diff reviewed", or "API change note":',
      "- CHANGELOG.md",
      "- docs/release-candidate.md",
      "- docs/api-maturity.md",
      "- docs/migration-*.md",
      "",
      "Set VUE_TUI_API_DIFF_ALLOW_NOTES=1 only after maintainer review.",
    ].join("\n"),
  );
  process.exit(1);
}
if (reviewRequiredNotes.length && nonPublicApiReviewNotePresent) {
  console.log(
    "Non-public API changes were accepted because a release/migration/API maturity note includes an API review marker.",
  );
}
if (!notes.length) console.log("No API drift detected.");
