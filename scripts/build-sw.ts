import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 分别构建 classic Worker，避免多入口构建把 Workbox 抽成共享 ESM chunk。
// Wiki 的 /sw.js 以默认 classic 模式注册，必须是无需外部依赖的单文件。
for (const site of ["prts", "fgo"] as const) {
  await build({
    configFile: false,
    root,
    publicDir: false,
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      outDir: path.join(root, "dist"),
      emptyOutDir: false,
      target: ["chrome70", "edge81", "firefox70", "safari12"],
      minify: "oxc",
      sourcemap: true,
      lib: {
        entry: path.join(root, `src/entries/sw.${site}.ts`),
        name: `${site}ServiceWorker`,
        formats: ["iife"],
        fileName: () => `sw.${site}.js`,
      },
      rollupOptions: {
        output: {
          // map 由 DevTools 加载，随 widgets 上传到 OSS，不参与 Worker 执行。
          sourcemapBaseUrl: "https://static.prts.wiki/widgets/production/",
        },
      },
    },
  });
}
