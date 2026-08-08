import path from "node:path";
import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const BASE_DIR = path.dirname(fileURLToPath(import.meta.url));

// scripts/prerender.ts 使用的 Node 端 SSR bundle。noExternal 全量内联，
// 保证 naive-ui 与 @css-render/vue3-ssr 共享同一个 css-render 实例，
// 否则 collect() 收集不到组件样式。
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(BASE_DIR, "./src"),
    },
  },
  plugins: [vue()],
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: "src/prerender/index.ts",
    outDir: "dist-ssr",
    emptyOutDir: true,
    sourcemap: false,
  },
});
