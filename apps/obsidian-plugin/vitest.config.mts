import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    // EditorView and test imports must share CodeMirror's state identity.
    dedupe: ["@codemirror/state", "@codemirror/view"],
    alias: {
      obsidian: resolve(rootDir, "src/test-stubs/obsidian.ts"),
    },
  },
  test: {
    environment: "node",
    server: { deps: { inline: [/@codemirror\//] } },
    include: ["src/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
};
