import type { PathPickMode, SuggestPathsResult } from "./path-suggest.js";

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
