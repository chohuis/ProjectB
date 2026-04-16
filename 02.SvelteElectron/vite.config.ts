import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "apps/ui"),
  plugins: [svelte()],
  build: {
    outDir: path.resolve(__dirname, "dist/ui"),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});

