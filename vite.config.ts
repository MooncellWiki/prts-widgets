import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

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
const nohashEntries = new Set(["DisplayController"]);

const input: Record<string, string> = {};
for (const entry of entries) {
  input[entry.replace(".ts", "")] = `src/entries/${entry}`;
}

const templatesInput: Record<string, string> = {
  sentry: "src/entries/sentry.ts",
  sw: "src/entries/sw.prts.ts",
  DisplayController: "src/entries/DisplayController.ts",
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
      minify: "terser",
      sourcemap: true,
      manifest: true,
      cssCodeSplit: false,
      rollupOptions: {
        input: useHtmlMode ? templatesInput : input,
        output: {
          sourcemapBaseUrl: "https://static.prts.wiki/widgets/production/",
          manualChunks(id) {
            if (
              id.includes("crypto-js") ||
              id.includes("workbox") ||
              id.includes("hammer")
            )
              return;

            if (id.includes("sentry")) return "sentry";
            if (id.includes("naive-ui")) return "naive-ui";
            if (id.includes("howler")) return "howler";
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
      terserOptions: {
        format: {
          comments: false,
        },
        compress: {
          passes: 10,
        },
      },
    },
  };
});
