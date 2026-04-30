import type { PathPickMode, SuggestPathsResult } from "./path-suggest-core.js";

export type FsEntryKind = "file" | "directory" | "other";

export type FsDirEntry = Readonly<{
  name: string;
  kind: FsEntryKind;
}>;

export type FsStat = Readonly<{
  exists: boolean;
  kind: FsEntryKind;
}>;

export type PathPickerProvider = Readonly<{
  listDir: (absDir: string) => Promise<FsDirEntry[]>;
  stat: (absPath: string) => Promise<FsStat>;
  suggest?: (
    info: Readonly<{
      workspaceAbs: string;
      input: string;
      mode: PathPickMode;
      max: number;
      showHidden?: boolean;
      maxDepth?: number;
      gitignore?: "blocking" | "nonBlocking";
    }>,
  ) => Promise<SuggestPathsResult>;
  resolvePath?: (workspaceAbs: string, input: string) => string | Promise<string>;
}>;

async function loadFsPromises(): Promise<typeof import("node:fs/promises")> {
  return import("node:fs/promises");
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
