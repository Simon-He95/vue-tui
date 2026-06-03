import { fileURLToPath, URL } from "node:url";

const fixtureRoot = fileURLToPath(new URL(".", import.meta.url));
const outDir = fileURLToPath(new URL("../../../.tmp/browser-vite-import", import.meta.url));

function distEntry(file: string): string {
  return fileURLToPath(new URL(`../../../dist/${file}`, import.meta.url));
}

export default {
  root: fixtureRoot,
  resolve: {
    alias: [
      { find: /^@simon_he\/vue-tui$/, replacement: distEntry("index.js") },
      { find: /^@simon_he\/vue-tui\/core$/, replacement: distEntry("core.js") },
      { find: /^@simon_he\/vue-tui\/runtime$/, replacement: distEntry("runtime.js") },
      { find: /^@simon_he\/vue-tui\/renderer\/dom$/, replacement: distEntry("renderer-dom.js") },
      { find: /^@simon_he\/vue-tui\/observability$/, replacement: distEntry("observability.js") },
      { find: /^@simon_he\/vue-tui\/vue$/, replacement: distEntry("vue.js") },
      { find: /^@simon_he\/vue-tui\/markdown$/, replacement: distEntry("markdown.js") },
      { find: /^@simon_he\/vue-tui\/experimental$/, replacement: distEntry("experimental.js") },
      { find: /^@simon_he\/vue-tui\/agent$/, replacement: distEntry("agent.js") },
      { find: /^@simon_he\/vue-tui\/mermaid$/, replacement: distEntry("mermaid.js") },
    ],
  },
  build: {
    outDir,
    emptyOutDir: true,
  },
};
