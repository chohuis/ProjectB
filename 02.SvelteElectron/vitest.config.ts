import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/ui/src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "packages/core/src"),
    },
  },
});
