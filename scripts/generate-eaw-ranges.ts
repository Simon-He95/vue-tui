#!/usr/bin/env tsx
/**
 * Generate East Asian Width ranges from Unicode 17.0.0 EastAsianWidth.txt
 *
 * Usage: pnpm exec tsx scripts/generate-eaw-ranges.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EAW_URL = "https://www.unicode.org/Public/17.0.0/ucd/EastAsianWidth.txt";
const UNICODE_DIR = path.join(__dirname, "unicode");
const EAW_FILE = path.join(UNICODE_DIR, "EastAsianWidth-17.0.0.txt");

// Expected SHA-256 for Unicode 17.0.0 EastAsianWidth.txt
// Validates that the source file is the official Unicode 17.0.0 release
const EXPECTED_EAW_SHA256 = "ea7ce50f3444a050333448dffef1cadd9325af55cbb764b4a2280faf52170a33";

interface Range {
  start: number;
  end: number;
  width: "W" | "F" | "A";
}

function parseHex(hex: string): number {
  return Number.parseInt(hex, 16);
}

function parseEAWFile(content: string): { wide: Range[]; ambiguous: Range[] } {
  const lines = content.split("\n");
  const wide: Range[] = [];
  const ambiguous: Range[] = [];

  for (const line of lines) {
    // Skip comments and empty lines
    if (!line || line.startsWith("#")) continue;

    // Parse: "1100..115F     ; W  # ..."
    const match = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([WFA])/);
    if (!match) continue;

    const start = parseHex(match[1]);
    const end = match[2] ? parseHex(match[2]) : start;
    const width = match[3] as "W" | "F" | "A";

    const range: Range = { start, end, width };

    if (width === "W" || width === "F") {
      wide.push(range);
    } else if (width === "A") {
      ambiguous.push(range);
    }
  }

  return { wide, ambiguous };
}

function mergeRanges(ranges: Range[]): Array<[number, number]> {
  // Sort by start
  ranges.sort((a, b) => a.start - b.start);

  const merged: Array<[number, number]> = [];
  let current: [number, number] | null = null;

  for (const range of ranges) {
    if (!current) {
      current = [range.start, range.end];
      continue;
    }

    // Can merge if adjacent or overlapping
    if (range.start <= current[1] + 1) {
      current[1] = Math.max(current[1], range.end);
    } else {
      merged.push(current);
      current = [range.start, range.end];
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

function formatRange(range: [number, number]): string {
  return `[0x${range[0].toString(16)}, 0x${range[1].toString(16)}]`;
}

function generateTypeScript(
  wide: Array<[number, number]>,
  ambiguous: Array<[number, number]>,
  sha256: string,
): string {
  const header = `/**
 * East Asian Width ranges generated from Unicode 17.0.0
 * Source: ${EAW_URL}
 * SHA-256: ${sha256}
 * 
 * DO NOT EDIT MANUALLY - regenerate with: pnpm exec tsx scripts/generate-eaw-ranges.ts
 */

`;

  const wideRanges = `export const fullWidthRanges: Array<[number, number]> = [
${wide.map((r) => "  " + formatRange(r)).join(",\n")},
];
`;

  const ambiguousRanges = `
export const ambiguousWidthRanges: Array<[number, number]> = [
${ambiguous.map((r) => "  " + formatRange(r)).join(",\n")},
];
`;

  return header + wideRanges + ambiguousRanges;
}

async function main() {
  console.log("Downloading EastAsianWidth.txt from Unicode 17.0.0...");

  // Ensure unicode directory exists
  if (!fs.existsSync(UNICODE_DIR)) {
    fs.mkdirSync(UNICODE_DIR, { recursive: true });
  }

  // Download file
  let content: string;
  if (fs.existsSync(EAW_FILE)) {
    console.log("Using existing file:", EAW_FILE);
    content = fs.readFileSync(EAW_FILE, "utf-8");
  } else {
    console.log("Downloading from:", EAW_URL);
    const response = await fetch(EAW_URL);
    if (!response.ok) {
      throw new Error(`Failed to download ${EAW_URL}: ${response.status} ${response.statusText}`);
    }
    content = await response.text();
    fs.writeFileSync(EAW_FILE, content);
    console.log("Saved to:", EAW_FILE);
  }

  // Calculate SHA-256
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  console.log("SHA-256:", sha256);

  // Validate SHA-256 matches expected value
  if (sha256 !== EXPECTED_EAW_SHA256) {
    throw new Error(
      `Unexpected EastAsianWidth.txt SHA-256:\n` +
        `  Expected: ${EXPECTED_EAW_SHA256}\n` +
        `  Got:      ${sha256}\n` +
        `The source file may have been modified or corrupted.`,
    );
  }
  console.log("✅ SHA-256 validated");

  console.log("Parsing EastAsianWidth.txt...");
  const { wide, ambiguous } = parseEAWFile(content);

  console.log(`Found ${wide.length} wide ranges, ${ambiguous.length} ambiguous ranges`);

  console.log("Merging adjacent ranges...");
  const mergedWide = mergeRanges(wide);
  const mergedAmbiguous = mergeRanges(ambiguous);

  console.log(
    `Merged to ${mergedWide.length} wide ranges, ${mergedAmbiguous.length} ambiguous ranges`,
  );

  console.log("Generating TypeScript code...");
  const tsCode = generateTypeScript(mergedWide, mergedAmbiguous, sha256);

  const outputPath = path.join(
    __dirname,
    "..",
    "src",
    "core",
    "buffer",
    "eaw-ranges-unicode-17.ts",
  );
  fs.writeFileSync(outputPath, tsCode);

  console.log(`✅ Generated ${outputPath}`);
  console.log("\nSummary:");
  console.log(`- Wide (W/F) ranges: ${mergedWide.length}`);
  console.log(`- Ambiguous (A) ranges: ${mergedAmbiguous.length}`);
  console.log(`- Supplementary plane CJK included: ${mergedWide.some((r) => r[0] >= 0x20000)}`);
  console.log(`- Source SHA-256: ${sha256}`);

  // Print some key ranges for verification
  console.log("\nKey supplementary plane ranges:");
  mergedWide
    .filter((r) => r[0] >= 0x20000 && r[0] < 0x40000)
    .forEach((r) => {
      console.log(`  ${formatRange(r)}`);
    });
}

main().catch((error) => {
  console.error("Error generating EAW ranges:", error);
  process.exit(1);
});
