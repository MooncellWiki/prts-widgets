import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import WindiCSS from "vite-plugin-windicss";
import { readdirSync } from "fs";
import { join } from "path";
const entries = readdirSync(join(__dirname, "src/entries/"));
const input = {};
entries.forEach((entry) => {
  input[entry.replace(".tsx", "")] = `src/entries/${entry}`;
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), WindiCSS()],
  server: {
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
        manualChunks(id) {
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
    assetsDir: ".",
  },
});
