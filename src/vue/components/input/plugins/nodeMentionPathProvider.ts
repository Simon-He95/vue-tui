import type { MentionPathProvider } from "./promptMentionState.js";
import { createNodePathPickerProvider } from "../../../../cli/path-provider.js";
import { suggestPaths } from "../../../../cli/path-suggest.js";

export function createNodeMentionPathProvider(): MentionPathProvider {
  const provider = createNodePathPickerProvider();

  return {
    async stat(absPath) {
      const stat = await provider.stat(absPath);
      return stat.exists ? stat.kind : null;
    },
    async suggest(info) {
      const res = await suggestPaths({
        workspaceAbs: info.workspaceAbs,
        input: info.input,
        mode: info.mode,
        max: info.max,
        showHidden: info.showHidden,
        listDir: provider.listDir,
        maxDepth: info.maxDepth,
      });
      return res.suggestions;
    },
  };
}
