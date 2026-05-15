import type { FsEntryKind, PathPickerProvider } from "../core/path-provider-types.js";
import { importNodeModule } from "../utils/node-module.js";
export type {
  FsDirEntry,
  FsEntryKind,
  FsStat,
  PathPickerProvider,
} from "../core/path-provider-types.js";

async function loadFsPromises(): Promise<typeof import("node:fs/promises")> {
  return (await importNodeModule<typeof import("node:fs/promises")>("node:fs/promises"))!;
}

function joinAbs(dir: string, name: string): string {
  if (!dir) return name;
  if (dir.endsWith("/") || dir.endsWith("\\")) return `${dir}${name}`;
  return `${dir}/${name}`;
}

export function createNodePathPickerProvider(): PathPickerProvider {
  const provider: PathPickerProvider = {
    async listDir(absDir) {
      const fs = await loadFsPromises();
      const list = await fs.readdir(absDir, { withFileTypes: true });
      return list.map((d) => {
        const kind: FsEntryKind = d.isDirectory() ? "directory" : d.isFile() ? "file" : "other";
        return { name: d.name, kind };
      });
    },
    async stat(absPath) {
      const fs = await loadFsPromises();
      try {
        const s = await fs.lstat(absPath);
        const kind: FsEntryKind = s.isDirectory() ? "directory" : s.isFile() ? "file" : "other";
        return { exists: true, kind };
      } catch {
        return { exists: false, kind: "other" };
      }
    },
    async suggest(info) {
      const { suggestPaths } = await import("./path-suggest.js");
      return suggestPaths({ ...info, listDir: provider.listDir });
    },
    async resolvePath(workspaceAbs, input) {
      const { resolveUserPath } = await import("./path-suggest.js");
      return resolveUserPath(workspaceAbs, input);
    },
  };
  return provider;
}

export function absPathFromEntry(absDir: string, entryName: string): string {
  return joinAbs(absDir, entryName);
}
