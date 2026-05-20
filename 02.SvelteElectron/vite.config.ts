import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  root: path.resolve(__dirname, "apps/ui"),
  publicDir: path.resolve(__dirname, "resource"),
  plugins: [svelte()],
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "packages/core/src"),
    }
  },
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist/ui"),
    emptyOutDir: true,
    sourcemap: mode !== "production",
  },
  server: {
    port: 5173,
    strictPort: true
  }
}));

