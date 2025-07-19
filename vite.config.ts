import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

const TARGET = ["chrome70", "edge81", "firefox70", "safari12", "ios12"];
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
        targets: TARGET,
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

            if (id.includes("commonjsHelpers")) return "commonjsHelpers";
            if (id.includes("sentry")) return "sentry";
            if (id.includes("naive-ui")) return "naive-ui";
            if (id.includes("howler")) return "howler";
            if (id.includes("vue-draggable-plus")) return "vue-draggable-plus";
            if (id.includes("html2canvas")) return "html2canvas";

            if (id.includes("node_modules") || id.includes("uno"))
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
        plugins: [
          {
            name: "prts",
            generateBundle(_options, bundle) {
              const bundles = Object.keys(bundle);
              const fileNames = ["vendor", "naive-ui", "common"].map((name) => {
                return bundles.find((v) => v.startsWith(name))!;
              });

              for (const key of Object.keys(bundle)) {
                const chunk = bundle[key];
                if (chunk.type !== "chunk") continue;

                if (chunk.fileName.startsWith("SpineViewer")) {
                  // SpineViewer 不需要改导入路径
                  continue;
                }
                for (const name of fileNames) {
                  chunk.code = chunk.code.replaceAll(
                    `./${name}`,
                    `https://static.prts.wiki/widgets/production/${name}`,
                  );
                }
              }
            },
          },
        ],
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
      target: TARGET,
    },
  };
});
