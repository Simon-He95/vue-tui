import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { reactive } from "vue";

const baseline = "59a30cb4fd031463eb7f9335d1faa80a484ca93a";
const sourcePath = "src/vue/markdown/layout.ts";
const directory = resolve(".tmp/tui-rust-ts/signatures");
const [command, arm, mode = "plain"] = process.argv.slice(2);

if (command === "prepare") {
  await mkdir(directory, { recursive: true });
  for (const variant of ["baseline", "candidate"]) {
    const source =
      variant === "baseline"
        ? execFileSync("git", ["show", `${baseline}:${sourcePath}`], { encoding: "utf8" })
        : await readFile(sourcePath, "utf8");
    await build({
      entryPoints: [sourcePath],
      outfile: `${directory}/${variant}.mjs`,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [
        {
          name: "paired-layout",
          setup(builder) {
            builder.onLoad({ filter: /[\\/]markdown[\\/]layout\.ts$/ }, () => ({
              contents: source,
              loader: "ts",
              resolveDir: dirname(resolve(sourcePath)),
            }));
          },
        },
      ],
    });
  }
} else if (command === "run") {
  const { layoutMarkdownBlocksCached, layoutMarkdownBlocks } = await import(
    pathToFileURL(`${directory}/${arm}.mjs`)
  );
  const blocks = Array.from({ length: 1200 }, (_, index) => ({
    type: "inline",
    key: `block-${index}`,
    segments: [
      {
        text: `Paragraph ${index}: original source failure ENOENT 中文🙂 é `,
        style: { fg: "cyan", bg: "black", bold: true, href: "https://example.com/a" },
      },
      { text: "unchanged content ".repeat(4), style: { dim: true } },
    ],
  }));
  const input = mode === "reactive" ? reactive(blocks) : blocks;
  let cache = layoutMarkdownBlocksCached(input, 100).cache;
  const times = [];
  const cpuTimes = [];
  const hash = createHash("sha256");
  for (let iteration = 0; iteration < (mode === "oneshot" ? 20 : 60); iteration++) {
    input[input.length - 1].segments[1].text += " delta";
    const cpuStart = process.cpuUsage();
    const started = performance.now();
    const result =
      mode === "oneshot"
        ? { rows: layoutMarkdownBlocks(input, 100) }
        : layoutMarkdownBlocksCached(input, 100, cache);
    times.push(performance.now() - started);
    const cpu = process.cpuUsage(cpuStart);
    cpuTimes.push((cpu.user + cpu.system) / 1000);
    if (result.cache) cache = result.cache;
    hash.update(JSON.stringify(result.rows));
    if (mode !== "oneshot") hash.update(JSON.stringify([...cache.entries]));
  }
  console.log(
    JSON.stringify({
      arm,
      mode,
      times,
      cpuTimes,
      outputSha256: hash.digest("hex"),
      memory: process.memoryUsage(),
      maxRssKiB: process.resourceUsage().maxRSS,
    }),
  );
} else if (command === "verify") {
  const a = await import(pathToFileURL(`${directory}/baseline.mjs`));
  const b = await import(pathToFileURL(`${directory}/candidate.mjs`));
  let seed = 1234;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  let cases = 0;
  for (let index = 0; index < 1000; index++) {
    const text = Array.from({ length: next() % 32 }, () =>
      String.fromCharCode(next() % 65536),
    ).join("");
    const style = {
      fg: index % 2 ? "cyan" : "",
      bg: "#101010",
      bold: !!(index & 1),
      dim: !!(index & 2),
      italic: !!(index & 4),
      underline: !!(index & 8),
      inverse: !!(index & 16),
      href: `https://example.com/${text}`,
    };
    const segments = [
      { text, style },
      { text: "中文👩🏽\u200d💻 é", hardBreak: !!(index & 1) },
    ];
    const blocks = [
      {
        type: "inline",
        key: "inline",
        segments,
        prefixSegments: [{ text: "> " }],
        continuationPrefixSegments: [{ text: "  " }],
      },
      { type: "code_block", key: "code", language: "ts", lines: [text, "const a = 1;"], style },
      { type: "thematic_break", key: "rule", char: index % 2 ? "─" : "", style },
      {
        type: "table",
        key: "table",
        header: [{ segments }],
        rows: [[{ segments, align: "right" }]],
        borderStyle: style,
      },
      { type: "blank", key: "blank" },
    ];
    for (const source of [blocks, reactive(blocks)]) {
      let ca, cb;
      for (const width of [80, 80, 17]) {
        source[0].segments[0].text += "\u0001delta";
        const first = a.layoutMarkdownBlocksCached(source, width, ca);
        const second = b.layoutMarkdownBlocksCached(source, width, cb);
        assert.deepEqual(second, first);
        assert.deepEqual(
          b.layoutMarkdownBlocks(source, width),
          a.layoutMarkdownBlocks(source, width),
        );
        ca = first.cache;
        cb = second.cache;
        cases++;
      }
    }
  }
  for (const width of [0, -1, 1, 80]) {
    assert.deepEqual(b.layoutMarkdownBlocks([], width), a.layoutMarkdownBlocks([], width));
  }
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify({ baseline, cases, exactRowsAndCacheSignatures: true }) + "\n",
  );
  console.log(JSON.stringify({ cases }));
} else throw new Error("Use prepare, verify, or run <baseline|candidate> <plain|reactive>");
