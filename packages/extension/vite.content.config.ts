import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src/content/index.ts"),
      name: "OiUContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});
