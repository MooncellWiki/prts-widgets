import { defineConfig } from "vitest/config";

// 全语料回归专用配置（约两分钟）：pnpm test:story-log
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/story-log-corpus.spec.ts"],
    testTimeout: 600_000,
  },
});
