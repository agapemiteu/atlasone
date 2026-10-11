import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Two static pages (home, docs) served by the Atlas One Worker as static assets.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "@atlas": path.resolve(__dirname, "../src/lib") } },
  build: {
    outDir: "dist",
    rollupOptions: { input: { index: path.resolve(__dirname, "index.html"), docs: path.resolve(__dirname, "docs.html"), guide: path.resolve(__dirname, "guide.html") } },
  },
});
