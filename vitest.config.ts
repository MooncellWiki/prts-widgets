import path from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.spec.ts"],
    // 全语料回归走 pnpm test:story-log（独立配置），不进普通单测
    exclude: ["**/node_modules/**", "tests/story-log-corpus.spec.ts"],
  },
});
