import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

const TARGET = ["chrome70", "edge81", "firefox70", "safari12", "ios12"];
const BASE_DIR = dirname(fileURLToPath(import.meta.url));

const entries = readdirSync(join(BASE_DIR, "src/entries/"));
const templates = readdirSync(join(BASE_DIR, "templates/"));
const nohashEntries = new Set(["DisplayController"]);

const input: Record<string, string> = {};
for (const entry of entries) {
  input[entry.replace(".ts", "")] = `src/entries/${entry}`;
}

const templatesInput: Record<string, string> = {
  sentry: "src/entries/sentry.ts",
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
        "@": resolve(BASE_DIR, "./src"),
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
            if (id.includes("crypto-js")) return;
            if (id.includes("sentry")) return "sentry";
            if (id.includes("naive-ui")) return "naive-ui";
            if (id.includes("hammer")) return;
            if (id.includes("node_modules")) return "vendor";
            if (id.includes("uno")) return "vendor";
            if (id.includes("src/components/")) return "common";
            if (id.includes("src/utils/")) return "common";
            if (id.includes("src/stores/")) return "common";
          },
          chunkFileNames: "[name].[hash].js",
          entryFileNames: (chunk) =>
            nohashEntries.has(chunk.name) ? "[name].js" : "[name].[hash].js",
          assetFileNames: "[name].[hash].[ext]",
        },
        plugins: [
          {
            name: "prts",
            generateBundle(options, bundle) {
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
        compress: {
          passes: 10,
        },
      },
      target: TARGET,
    },
  };
});
