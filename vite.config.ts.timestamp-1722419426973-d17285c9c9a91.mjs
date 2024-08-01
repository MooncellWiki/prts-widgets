// vite.config.ts
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import legacy from "file:///E:/prts-widgets/prts-widgets/node_modules/@vitejs/plugin-legacy/dist/index.mjs";
import vue from "file:///E:/prts-widgets/prts-widgets/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { visualizer } from "file:///E:/prts-widgets/prts-widgets/node_modules/rollup-plugin-visualizer/dist/plugin/index.js";
import UnoCSS from "file:///E:/prts-widgets/prts-widgets/node_modules/unocss/dist/vite.mjs";
import { defineConfig } from "file:///E:/prts-widgets/prts-widgets/node_modules/vite/dist/node/index.js";
var __vite_injected_original_import_meta_url =
  "file:///E:/prts-widgets/prts-widgets/vite.config.ts";
var TARGET = ["chrome70", "edge81", "firefox70", "safari12", "ios12"];
var BASE_DIR = path.dirname(
  fileURLToPath(__vite_injected_original_import_meta_url),
);
var entries = readdirSync(path.join(BASE_DIR, "src/entries/"));
var templates = readdirSync(path.join(BASE_DIR, "templates/"));
var nohashEntries = /* @__PURE__ */ new Set(["DisplayController"]);
var input = {};
for (const entry of entries) {
  input[entry.replace(".ts", "")] = `src/entries/${entry}`;
}
var templatesInput = {
  sentry: "src/entries/sentry.ts",
  sw: "src/entries/sw.prts.ts",
  DisplayController: "src/entries/DisplayController.ts",
};
for (const template of templates) {
  templatesInput[template.replace(".html", "")] = `templates/${template}`;
}
var vite_config_default = defineConfig(({ command }) => {
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
            if (id.includes("workbox")) return;
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
                return bundles.find((v) => v.startsWith(name));
              });
              for (const key of Object.keys(bundle)) {
                const chunk = bundle[key];
                if (chunk.type !== "chunk") continue;
                if (chunk.fileName.startsWith("SpineViewer")) {
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
export { vite_config_default as default };
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJFOlxcXFxwcnRzLXdpZGdldHNcXFxccHJ0cy13aWRnZXRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJFOlxcXFxwcnRzLXdpZGdldHNcXFxccHJ0cy13aWRnZXRzXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9FOi9wcnRzLXdpZGdldHMvcHJ0cy13aWRnZXRzL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgcmVhZGRpclN5bmMgfSBmcm9tIFwibm9kZTpmc1wiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwibm9kZTpwYXRoXCI7XHJcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tIFwibm9kZTp1cmxcIjtcclxuXHJcbmltcG9ydCBsZWdhY3kgZnJvbSBcIkB2aXRlanMvcGx1Z2luLWxlZ2FjeVwiO1xyXG5pbXBvcnQgdnVlIGZyb20gXCJAdml0ZWpzL3BsdWdpbi12dWVcIjtcclxuaW1wb3J0IHsgdmlzdWFsaXplciB9IGZyb20gXCJyb2xsdXAtcGx1Z2luLXZpc3VhbGl6ZXJcIjtcclxuaW1wb3J0IFVub0NTUyBmcm9tIFwidW5vY3NzL3ZpdGVcIjtcclxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuXHJcbmNvbnN0IFRBUkdFVCA9IFtcImNocm9tZTcwXCIsIFwiZWRnZTgxXCIsIFwiZmlyZWZveDcwXCIsIFwic2FmYXJpMTJcIiwgXCJpb3MxMlwiXTtcclxuY29uc3QgQkFTRV9ESVIgPSBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKTtcclxuXHJcbmNvbnN0IGVudHJpZXMgPSByZWFkZGlyU3luYyhwYXRoLmpvaW4oQkFTRV9ESVIsIFwic3JjL2VudHJpZXMvXCIpKTtcclxuY29uc3QgdGVtcGxhdGVzID0gcmVhZGRpclN5bmMocGF0aC5qb2luKEJBU0VfRElSLCBcInRlbXBsYXRlcy9cIikpO1xyXG5jb25zdCBub2hhc2hFbnRyaWVzID0gbmV3IFNldChbXCJEaXNwbGF5Q29udHJvbGxlclwiXSk7XHJcblxyXG5jb25zdCBpbnB1dDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xyXG5mb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcclxuICBpbnB1dFtlbnRyeS5yZXBsYWNlKFwiLnRzXCIsIFwiXCIpXSA9IGBzcmMvZW50cmllcy8ke2VudHJ5fWA7XHJcbn1cclxuXHJcbmNvbnN0IHRlbXBsYXRlc0lucHV0OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gIHNlbnRyeTogXCJzcmMvZW50cmllcy9zZW50cnkudHNcIixcclxuICBzdzogXCJzcmMvZW50cmllcy9zdy5wcnRzLnRzXCIsXHJcbiAgRGlzcGxheUNvbnRyb2xsZXI6IFwic3JjL2VudHJpZXMvRGlzcGxheUNvbnRyb2xsZXIudHNcIixcclxufTtcclxuZm9yIChjb25zdCB0ZW1wbGF0ZSBvZiB0ZW1wbGF0ZXMpIHtcclxuICB0ZW1wbGF0ZXNJbnB1dFt0ZW1wbGF0ZS5yZXBsYWNlKFwiLmh0bWxcIiwgXCJcIildID0gYHRlbXBsYXRlcy8ke3RlbXBsYXRlfWA7XHJcbn1cclxuXHJcbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBjb21tYW5kIH0pID0+IHtcclxuICBjb25zdCB1c2VIdG1sTW9kZSA9IGNvbW1hbmQgPT09IFwiYnVpbGRcIjtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGJhc2U6IHVzZUh0bWxNb2RlID8gXCJodHRwczovL3N0YXRpYy5wcnRzLndpa2kvd2lkZ2V0cy9wcm9kdWN0aW9uXCIgOiBcIi9cIixcclxuICAgIHJlc29sdmU6IHtcclxuICAgICAgYWxpYXM6IHtcclxuICAgICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKEJBU0VfRElSLCBcIi4vc3JjXCIpLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICAgIHBsdWdpbnM6IFtcclxuICAgICAgdnVlKCksXHJcbiAgICAgIFVub0NTUygpLFxyXG4gICAgICBsZWdhY3koe1xyXG4gICAgICAgIHRhcmdldHM6IFRBUkdFVCxcclxuICAgICAgICBtb2Rlcm5Qb2x5ZmlsbHM6IHRydWUsXHJcbiAgICAgICAgcmVuZGVyTGVnYWN5Q2h1bmtzOiBmYWxzZSxcclxuICAgICAgfSksXHJcbiAgICAgIHZpc3VhbGl6ZXIoeyBzb3VyY2VtYXA6IHRydWUgfSksXHJcbiAgICBdLFxyXG4gICAgc2VydmVyOiB7XHJcbiAgICAgIHBvcnQ6IDgwODAsXHJcbiAgICAgIGhtcjoge1xyXG4gICAgICAgIGhvc3Q6IFwibG9jYWxob3N0XCIsXHJcbiAgICAgICAgcHJvdG9jb2w6IFwid3NcIixcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgICBidWlsZDoge1xyXG4gICAgICBtaW5pZnk6IFwidGVyc2VyXCIsXHJcbiAgICAgIHNvdXJjZW1hcDogdHJ1ZSxcclxuICAgICAgbWFuaWZlc3Q6IHRydWUsXHJcbiAgICAgIGNzc0NvZGVTcGxpdDogZmFsc2UsXHJcbiAgICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgICBpbnB1dDogdXNlSHRtbE1vZGUgPyB0ZW1wbGF0ZXNJbnB1dCA6IGlucHV0LFxyXG4gICAgICAgIG91dHB1dDoge1xyXG4gICAgICAgICAgc291cmNlbWFwQmFzZVVybDogXCJodHRwczovL3N0YXRpYy5wcnRzLndpa2kvd2lkZ2V0cy9wcm9kdWN0aW9uL1wiLFxyXG4gICAgICAgICAgbWFudWFsQ2h1bmtzKGlkKSB7XHJcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcImNyeXB0by1qc1wiKSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoXCJ3b3JrYm94XCIpKSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcInNlbnRyeVwiKSkgcmV0dXJuIFwic2VudHJ5XCI7XHJcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcIm5haXZlLXVpXCIpKSByZXR1cm4gXCJuYWl2ZS11aVwiO1xyXG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoXCJoYW1tZXJcIikpIHJldHVybjtcclxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwibm9kZV9tb2R1bGVzXCIpKSByZXR1cm4gXCJ2ZW5kb3JcIjtcclxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwidW5vXCIpKSByZXR1cm4gXCJ2ZW5kb3JcIjtcclxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwic3JjL2NvbXBvbmVudHMvXCIpKSByZXR1cm4gXCJjb21tb25cIjtcclxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwic3JjL3V0aWxzL1wiKSkgcmV0dXJuIFwiY29tbW9uXCI7XHJcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcInNyYy9zdG9yZXMvXCIpKSByZXR1cm4gXCJjb21tb25cIjtcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBjaHVua0ZpbGVOYW1lczogXCJbbmFtZV0uW2hhc2hdLmpzXCIsXHJcbiAgICAgICAgICBlbnRyeUZpbGVOYW1lczogKGNodW5rKSA9PlxyXG4gICAgICAgICAgICBub2hhc2hFbnRyaWVzLmhhcyhjaHVuay5uYW1lKSA/IFwiW25hbWVdLmpzXCIgOiBcIltuYW1lXS5baGFzaF0uanNcIixcclxuICAgICAgICAgIGFzc2V0RmlsZU5hbWVzOiBcIltuYW1lXS5baGFzaF0uW2V4dF1cIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIHBsdWdpbnM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgbmFtZTogXCJwcnRzXCIsXHJcbiAgICAgICAgICAgIGdlbmVyYXRlQnVuZGxlKG9wdGlvbnMsIGJ1bmRsZSkge1xyXG4gICAgICAgICAgICAgIGNvbnN0IGJ1bmRsZXMgPSBPYmplY3Qua2V5cyhidW5kbGUpO1xyXG4gICAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lcyA9IFtcInZlbmRvclwiLCBcIm5haXZlLXVpXCIsIFwiY29tbW9uXCJdLm1hcCgobmFtZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGJ1bmRsZXMuZmluZCgodikgPT4gdi5zdGFydHNXaXRoKG5hbWUpKSE7XHJcbiAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGJ1bmRsZSkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNodW5rID0gYnVuZGxlW2tleV07XHJcbiAgICAgICAgICAgICAgICBpZiAoY2h1bmsudHlwZSAhPT0gXCJjaHVua1wiKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoY2h1bmsuZmlsZU5hbWUuc3RhcnRzV2l0aChcIlNwaW5lVmlld2VyXCIpKSB7XHJcbiAgICAgICAgICAgICAgICAgIC8vIFNwaW5lVmlld2VyIFx1NEUwRFx1OTcwMFx1ODk4MVx1NjUzOVx1NUJGQ1x1NTE2NVx1OERFRlx1NUY4NFxyXG4gICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbmFtZSBvZiBmaWxlTmFtZXMpIHtcclxuICAgICAgICAgICAgICAgICAgY2h1bmsuY29kZSA9IGNodW5rLmNvZGUucmVwbGFjZUFsbChcclxuICAgICAgICAgICAgICAgICAgICBgLi8ke25hbWV9YCxcclxuICAgICAgICAgICAgICAgICAgICBgaHR0cHM6Ly9zdGF0aWMucHJ0cy53aWtpL3dpZGdldHMvcHJvZHVjdGlvbi8ke25hbWV9YCxcclxuICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0sXHJcbiAgICAgIGFzc2V0c0RpcjogXCIuXCIsXHJcbiAgICAgIHRlcnNlck9wdGlvbnM6IHtcclxuICAgICAgICBjb21wcmVzczoge1xyXG4gICAgICAgICAgcGFzc2VzOiAxMCxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgICB0YXJnZXQ6IFRBUkdFVCxcclxuICAgIH0sXHJcbiAgfTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNFEsU0FBUyxtQkFBbUI7QUFDeFMsT0FBTyxVQUFVO0FBQ2pCLFNBQVMscUJBQXFCO0FBRTlCLE9BQU8sWUFBWTtBQUNuQixPQUFPLFNBQVM7QUFDaEIsU0FBUyxrQkFBa0I7QUFDM0IsT0FBTyxZQUFZO0FBQ25CLFNBQVMsb0JBQW9CO0FBUndJLElBQU0sMkNBQTJDO0FBVXROLElBQU0sU0FBUyxDQUFDLFlBQVksVUFBVSxhQUFhLFlBQVksT0FBTztBQUN0RSxJQUFNLFdBQVcsS0FBSyxRQUFRLGNBQWMsd0NBQWUsQ0FBQztBQUU1RCxJQUFNLFVBQVUsWUFBWSxLQUFLLEtBQUssVUFBVSxjQUFjLENBQUM7QUFDL0QsSUFBTSxZQUFZLFlBQVksS0FBSyxLQUFLLFVBQVUsWUFBWSxDQUFDO0FBQy9ELElBQU0sZ0JBQWdCLG9CQUFJLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztBQUVuRCxJQUFNLFFBQWdDLENBQUM7QUFDdkMsV0FBVyxTQUFTLFNBQVM7QUFDM0IsUUFBTSxNQUFNLFFBQVEsT0FBTyxFQUFFLENBQUMsSUFBSSxlQUFlLEtBQUs7QUFDeEQ7QUFFQSxJQUFNLGlCQUF5QztBQUFBLEVBQzdDLFFBQVE7QUFBQSxFQUNSLElBQUk7QUFBQSxFQUNKLG1CQUFtQjtBQUNyQjtBQUNBLFdBQVcsWUFBWSxXQUFXO0FBQ2hDLGlCQUFlLFNBQVMsUUFBUSxTQUFTLEVBQUUsQ0FBQyxJQUFJLGFBQWEs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
