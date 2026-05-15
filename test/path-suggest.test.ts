import { describe, expect, it } from "vitest";
import { resolveUserPath, suggestPaths } from "../src/cli/path-suggest.js";
import { suggestPaths as suggestCorePaths } from "../src/core/path-suggest.js";

describe("path suggest", () => {
  it("suggests directories and files with fuzzy matching", async () => {
    const listDir = async () => [
      { name: "src", kind: "directory" as const },
      { name: "scripts", kind: "directory" as const },
      { name: "package.json", kind: "file" as const },
      { name: "README.md", kind: "file" as const },
    ];

    const res = await suggestPaths({
      workspaceAbs: "/ws",
      input: "s",
      mode: "any",
      max: 10,
      listDir,
    });

    expect(res.suggestions.map((s) => s.display)).toEqual(["src/", "scripts/", "package.json"]);
    expect(res.suggestions[0]?.absPath).toBe("/ws/src");
  });

  it("allows searching dotfiles and dot-directories by default", async () => {
    const listDir = async () => [
      { name: "src", kind: "directory" as const },
      { name: ".env", kind: "file" as const },
      { name: ".github", kind: "directory" as const },
    ];

    const browse = await suggestPaths({
      workspaceAbs: "/ws",
      input: "",
      mode: "any",
      max: 10,
      listDir,
    });
    // Browsing (empty query) hides dot-entries unless showHidden is enabled.
    expect(browse.suggestions.map((s) => s.display)).toEqual(["src/"]);

    const searchEnv = await suggestPaths({
      workspaceAbs: "/ws",
      input: "env",
      mode: "any",
      max: 10,
      listDir,
    });
    expect(searchEnv.suggestions.map((s) => s.display)).toEqual([".env"]);

    const searchGithub = await suggestPaths({
      workspaceAbs: "/ws",
      input: "github",
      mode: "any",
      max: 10,
      listDir,
    });
    expect(searchGithub.suggestions.map((s) => s.display)).toEqual([".github/"]);
  });

  it("filters by mode", async () => {
    const listDir = async () => [
      { name: "src", kind: "directory" as const },
      { name: "package.json", kind: "file" as const },
    ];

    const dirs = await suggestPaths({
      workspaceAbs: "/ws",
      input: "",
      mode: "directory",
      max: 10,
      listDir,
    });
    expect(dirs.suggestions.map((s) => s.display)).toEqual(["src/"]);

    const files = await suggestPaths({
      workspaceAbs: "/ws",
      input: "",
      mode: "file",
      max: 10,
      listDir,
    });
    // In file mode we still suggest directories so users can navigate into them.
    expect(files.suggestions.map((s) => s.display)).toEqual(["package.json", "src/"]);
  });

  it("finds deep paths and matches on full relPath", async () => {
    const fs = new Map<string, { name: string; kind: "directory" | "file" }[]>();
    fs.set("/ws", [{ name: "packages", kind: "directory" }]);
    fs.set("/ws/packages", [{ name: "cli", kind: "directory" }]);
    fs.set("/ws/packages/cli", [{ name: "src", kind: "directory" }]);
    fs.set("/ws/packages/cli/src", [{ name: "pages", kind: "directory" }]);
    fs.set("/ws/packages/cli/src/pages", [{ name: "ChatPage", kind: "directory" }]);
    fs.set("/ws/packages/cli/src/pages/ChatPage", [{ name: "index.ts", kind: "file" }]);

    const listDir = async (absDir: string) => {
      const hit = fs.get(absDir);
      if (!hit) throw new Error(`ENOENT: ${absDir}`);
      return hit.map((e) => ({ name: e.name, kind: e.kind as any }));
    };

    const res = await suggestPaths({
      workspaceAbs: "/ws",
      input: "ChatPage",
      mode: "any",
      max: 10,
      listDir,
      maxDepth: 8,
    });

    expect(res.suggestions.map((s) => s.display)).toEqual([
      "packages/cli/src/pages/ChatPage/",
      "packages/cli/src/pages/ChatPage/index.ts",
    ]);
  });

  it('falls back when dirPrefix does not exist (e.g. "ChatPage/")', async () => {
    const fs = new Map<string, { name: string; kind: "directory" | "file" }[]>();
    fs.set("/ws", [{ name: "packages", kind: "directory" }]);
    fs.set("/ws/packages", [{ name: "cli", kind: "directory" }]);
    fs.set("/ws/packages/cli", [{ name: "src", kind: "directory" }]);
    fs.set("/ws/packages/cli/src", [{ name: "pages", kind: "directory" }]);
    fs.set("/ws/packages/cli/src/pages", [{ name: "ChatPage", kind: "directory" }]);
    fs.set("/ws/packages/cli/src/pages/ChatPage", [{ name: "index.ts", kind: "file" }]);

    const listDir = async (absDir: string) => {
      const hit = fs.get(absDir);
      if (!hit) throw new Error(`ENOENT: ${absDir}`);
      return hit.map((e) => ({ name: e.name, kind: e.kind as any }));
    };

    const res = await suggestPaths({
      workspaceAbs: "/ws",
      input: "ChatPage/",
      mode: "any",
      max: 10,
      listDir,
      maxDepth: 8,
    });

    expect(res.suggestions.map((s) => s.display)).toEqual([
      "packages/cli/src/pages/ChatPage/",
      "packages/cli/src/pages/ChatPage/index.ts",
    ]);
  });

  it("resolves user paths relative to workspace", () => {
    expect(resolveUserPath("/ws", "src/cli")).toBe("/ws/src/cli");
    expect(resolveUserPath("/ws", "../x")).toBe("/x");
    expect(resolveUserPath("/ws", "/tmp/a")).toBe("/tmp/a");
  });

  it("caps scanning to avoid runaway memory/CPU on large workspaces", async () => {
    let calls = 0;
    const listDir = async (_absDir: string) => {
      calls++;
      // Always return a large directory listing; without scan caps this would
      // explode when maxDepth > 0.
      return Array.from({ length: 1000 }, (_, i) => {
        if (i % 2 === 0)
          return {
            name: `a-file-${String(i).padStart(4, "0")}.txt`,
            kind: "file" as const,
          };
        return {
          name: `dir-${String(i).padStart(4, "0")}`,
          kind: "directory" as const,
        };
      });
    };

    const res = await suggestPaths({
      workspaceAbs: "/ws",
      input: "a",
      mode: "any",
      max: 20,
      listDir,
      maxDepth: 8,
    });

    expect(res.suggestions).toHaveLength(20);
    expect(calls).toBeLessThan(200);
  });

  it("bails out early when input contains NUL bytes", async () => {
    const listDir = async () => {
      throw new Error("listDir should not be called");
    };

    const res = await suggestPaths({
      workspaceAbs: "/ws",
      input: "a\0b",
      mode: "any",
      max: 10,
      listDir,
      maxDepth: 8,
    });

    expect(res.suggestions).toEqual([]);
  });

  it("normalizes slash-heavy path input without regex backtracking", async () => {
    const input = `./${"/".repeat(200_000)}foo${"/".repeat(200_000)}`;
    const seen: string[] = [];

    const result = await suggestCorePaths({
      workspaceAbs: "/workspace",
      input,
      mode: "any",
      max: 5,
      async listDir() {
        return [{ name: "bar", kind: "file" as const }];
      },
      shouldIgnore({ normalizedRelPath }) {
        seen.push(normalizedRelPath);
        return true;
      },
    });

    expect(seen).toEqual(["foo/bar"]);
    expect(result.suggestions).toEqual([]);
  });

  it("handles long slash-heavy input without regex backtracking", async () => {
    const input = `.${"/".repeat(50_000)}target`;

    const result = await suggestCorePaths({
      workspaceAbs: "/workspace",
      input,
      mode: "any",
      max: 10,
      listDir: async () => [],
    });

    expect(result.suggestions).toEqual([]);
    expect(result.baseDirAbs).toBeTruthy();
  });
});
