import { readdirSync } from "node:fs";
import { dirname, join, resolve, parse } from "node:path";
import { fileURLToPath } from "node:url";

import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

const TARGET = ["chrome70", "edge81", "firefox70", "safari12", "ios12"];
const TARGET_LANG = new Set(["enUS", "jaJP", "koKR", "zhCN", "zhTW"]);

const entries = readdirSync(
  join(dirname(fileURLToPath(import.meta.url)), "src/entries/"),
);
const nohashEntries = new Set(["DisplayController"]);
const input: Record<string, string> = {};
for (const entry of entries) {
  input[entry.replace(".ts", "")] = `src/entries/${entry}`;
}

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(dirname(fileURLToPath(import.meta.url)), "./src"),
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
      input,
      output: {
        sourcemapBaseUrl: "https://static.prts.wiki/widgets/release/",
        manualChunks(id) {
          if (id.includes("sentry")) return "sentry";
          if (id.includes("naive-ui/es/locales/")) {
            const lang = parse(id).name;
            if (TARGET_LANG.has(lang)) return `locales-${lang}`;
          }
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
                  `https://static.prts.wiki/widgets/release/${name}`,
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
});
