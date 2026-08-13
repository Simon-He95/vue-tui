/**
 * Terminal NES emulator — ROM compatibility checker.
 *
 * Verifies a .nes ROM is loadable by the bundled jsnes core and reports its
 * mapper, so you can confirm a legally-owned ROM (e.g. an original Contra
 * cartridge) is playable before launching the game.
 *
 *   bun run check:nes:rom [path/to/game.nes]
 *   # defaults to examples/nes/roms/contra.nes if present, else falling.nes
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Nes from "./vendor/jsnes/src/nes.js";

const defaultRom = fileURLToPath(new URL("../assets/falling.nes", import.meta.url));
const contraRom = fileURLToPath(new URL("../roms/contra.nes", import.meta.url));
const candidate = process.argv[2] ?? (existsSync(contraRom) ? contraRom : defaultRom);

if (!existsSync(candidate)) {
  process.stderr.write(
    `[nes] no ROM at ${candidate}. Pass a path, or place your (legally owned) ROM at ` +
      `examples/nes/roms/contra.nes\n`,
  );
  process.exit(2);
}
const bytes = readFileSync(candidate);
if (
  bytes.length < 16 ||
  bytes[0] !== 0x4e ||
  bytes[1] !== 0x45 ||
  bytes[2] !== 0x53 ||
  bytes[3] !== 0x1a
) {
  process.stderr.write(`[nes] ${candidate} is not an iNES .nes file.\n`);
  process.exit(2);
}

let mapper = -1;
try {
  const nes = new Nes({ emulateSound: false });
  nes.loadROM(new Uint8Array(bytes));
  const rom = (
    nes as unknown as {
      rom?: { mapperType?: number; romCount?: number; vromCount?: number; mirroring?: number };
    }
  ).rom;
  mapper = rom?.mapperType ?? -1;
  // Run a handful of frames to confirm the mapper actually executes without error.
  for (let i = 0; i < 3; i++) nes.frame();
  console.log(
    JSON.stringify(
      {
        rom: candidate,
        bytes: bytes.length,
        loaded: true,
        mapper,
        mapperSupported: mapper >= 0,
        prgBanks: rom?.romCount,
        chrBanks: rom?.vromCount,
        mirroring: rom?.mirroring ? "vertical" : "horizontal",
      },
      null,
      2,
    ),
  );
  console.log(
    mapper >= 0
      ? "nes rom check: OK — this ROM runs on the bundled jsnes core."
      : "nes rom check: FAILED",
  );
  process.exit(mapper >= 0 ? 0 : 1);
} catch (error) {
  console.log(
    JSON.stringify(
      {
        rom: candidate,
        bytes: bytes.length,
        loaded: false,
        mapper,
        mapperSupported: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  console.log("nes rom check: FAILED — this ROM is not supported by the bundled jsnes core.");
  process.exit(1);
}
