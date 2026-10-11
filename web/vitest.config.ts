import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "@atlas": path.resolve(__dirname, "../src/lib") } },
  esbuild: { jsx: "automatic" },
});
