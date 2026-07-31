import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
// 포트 정본은 dev-server.config.cjs 하나다 (네 군데 흩어져 있던 걸 모았다)
import { createRequire } from "node:module";
const { DEV_PORT } = createRequire(import.meta.url)("./dev-server.config.cjs");

export default defineConfig(({ mode }) => ({
  root: path.resolve(__dirname, "apps/ui"),
  publicDir: path.resolve(__dirname, "resource"),
  plugins: [svelte()],
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "packages/core/src"),
    }
  },
  base: mode === "production" ? "app://bundle/" : "./",
  build: {
    outDir: path.resolve(__dirname, "dist/ui"),
    emptyOutDir: true,
    sourcemap: mode !== "production",
  },
  server: {
    port: DEV_PORT,
    strictPort: true
  }
}));

