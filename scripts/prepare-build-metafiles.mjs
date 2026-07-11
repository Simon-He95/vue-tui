import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const metaDir = resolve(process.cwd(), ".tmp/build-metafiles");
rmSync(metaDir, { recursive: true, force: true });
mkdirSync(metaDir, { recursive: true });
