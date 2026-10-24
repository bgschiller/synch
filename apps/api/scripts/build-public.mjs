import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectDir = fileURLToPath(new URL("../", import.meta.url));
await build({
  configFile: path.join(projectDir, "vite.config.mts"),
  build: { outDir: path.join(projectDir, "public"), emptyOutDir: true },
});
