import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import UnoCSS from "unocss/vite";
import { defineConfig, type Plugin } from "vite";

const TARGET = [
  "edge >= 81",
  "firefox >= 70",
  "chrome >= 70",
  "safari >= 12",
  "chromeAndroid >= 64",
  "ios >= 12",
];
const BASE_DIR = path.dirname(fileURLToPath(import.meta.url));

const entries = readdirSync(path.join(BASE_DIR, "src/entries/"));
const templates = readdirSync(path.join(BASE_DIR, "templates/"));
const nohashEntries = new Set(["sentry", "sw", "DisplayController", "Tooltip"]);

const TIPPY_MODULE_RE = /[/\\]node_modules[/\\]tippy\.js[/\\]/;
// 改写后必须出现的记号，tippy 升级时用来兜住上游改类名的情况。
const TIPPY_NAMESPACE_MARKERS = [
  "tippy6-box",
  "tippy6-content",
  "tippy6-backdrop",
  "tippy6-arrow",
  "tippy6-svg-arrow",
  "data-tippy6-root",
];

/**
 * 把 npm 包里的 `tippy-` 前缀改写成 `tippy6-`。
 *
 * 站内 SMW 自带一份 tippy，占了 `window.tippy` 和 `.tippy-box`，所以 PRTS 一直用的
 * 是把前缀整体改名成 tippy6 的自定义构建。MediaWiki:Gadget-darkModeFix.css、
 * 微件:CharShow 的内联样式、MediaWiki:Gadget-TippyRef.css 都按 `tippy6-` 写死了，
 * 换成 npm 包打包后要继续保持这套命名。
 */
function tippyNamespace(): Plugin {
  return {
    name: "prts:tippy-namespace",
    enforce: "pre",
    transform(code, id) {
      if (!TIPPY_MODULE_RE.test(id)) return null;

      const transformed = code.replaceAll("tippy-", "tippy6-");
      if (id.includes("tippy.esm.js")) {
        const missing = TIPPY_NAMESPACE_MARKERS.filter(
          (marker) => !transformed.includes(marker),
        );
        if (missing.length > 0)
          throw new Error(
            `tippy 改名后缺少 ${missing.join("、")}，请确认 tippy 升级后的类名`,
          );
      }

      return { code: transformed, map: null };
    },
  };
}

const input: Record<string, string> = {};
for (const entry of entries) {
  input[entry.replace(".ts", "")] = `src/entries/${entry}`;
}

const templatesInput: Record<string, string> = {
  sentry: "src/entries/sentry.ts",
  sw: "src/entries/sw.prts.ts",
  DisplayController: "src/entries/DisplayController.ts",
  Tooltip: "src/entries/Tooltip.ts",
};
for (const template of templates) {
  templatesInput[template.replace(".html", "")] = `templates/${template}`;
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const useHtmlMode = command === "build";

  return {
    base: useHtmlMode ? "https://static.prts.wiki/widgets/production" : "/",
    resolve: {
      alias: {
        "@": path.resolve(BASE_DIR, "./src"),
      },
    },
    plugins: [
      vue(),
      UnoCSS(),
      legacy({
        modernTargets: TARGET,
        modernPolyfills: true,
        renderLegacyChunks: false,
      }),
      tippyNamespace(),
      visualizer({ sourcemap: true }),
    ],
    server: {
      cors: {
        origin:
          /^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|(m\.)?prts\.wiki|\[::1\])(?::\d+)?$/,
      },
      port: 8080,
      hmr: {
        host: "localhost",
        protocol: "ws",
      },
    },
    build: {
      minify: "oxc",
      sourcemap: true,
      manifest: true,
      cssCodeSplit: false,
      rollupOptions: {
        input: useHtmlMode ? templatesInput : input,
        output: {
          sourcemapBaseUrl: "https://static.prts.wiki/widgets/production/",
          manualChunks(id) {
            // Tooltip 入口是 <head> 里以固定文件名引用的，不能依赖带 hash 的共享
            // chunk，tippy 必须内联进去。
            if (TIPPY_MODULE_RE.test(id) || id.includes("@popperjs")) return;

            if (
              id.includes("crypto-js") ||
              id.includes("workbox") ||
              id.includes("hammer")
            )
              return;

            if (id.includes("sentry")) return "sentry";
            if (id.includes("naive-ui")) return "naive-ui";
            if (id.includes("howler")) return "howler";
            if (id.includes("pixi")) return "pixi";
            if (
              id.includes("@zumer/snapdom") ||
              id.includes("vue-draggable-plus")
            )
              return;

            if (
              id.includes("commonjsHelpers") ||
              id.includes("node_modules") ||
              id.includes("uno")
            )
              return "vendor";

            if (
              id.includes("src/components/") ||
              id.includes("src/utils/") ||
              id.includes("src/stores/")
            )
              return "common";
          },
          chunkFileNames: "[name].[hash].js",
          entryFileNames: (chunk) =>
            nohashEntries.has(chunk.name) ? "[name].js" : "[name].[hash].js",
          assetFileNames: "[name].[hash].[ext]",
        },
      },
      assetsDir: ".",
    },
  };
});
