import { fileURLToPath, URL } from "node:url";

function distEntry(file: string): string {
  return fileURLToPath(new URL(`../../../dist/${file}`, import.meta.url));
}

export default {
  resolve: {
    alias: [
      { find: /^@simon_he\/vue-tui$/, replacement: distEntry("index.js") },
      { find: /^@simon_he\/vue-tui\/markdown$/, replacement: distEntry("markdown.js") },
      { find: /^@simon_he\/vue-tui\/experimental$/, replacement: distEntry("experimental.js") },
    ],
  },
  build: {
    outDir: "../../../.tmp/browser-vite-import",
    emptyOutDir: true,
  },
};
