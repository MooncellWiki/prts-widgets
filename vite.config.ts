import { readdirSync } from 'fs';
import { join } from 'path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import WindiCSS from 'vite-plugin-windicss';
import { visualizer } from 'rollup-plugin-visualizer';
const entries = readdirSync(join(__dirname, 'src/entries/'));
const input = {};
entries.forEach((entry) => {
    input[entry.replace('.ts', '')] = `src/entries/${entry}`;
});

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue(), WindiCSS(), visualizer({ sourcemap: true })],
    server: {
        hmr: {
            host: 'localhost',
            protocol: 'ws',
        },
    },
    build: {
        minify: 'terser',
        sourcemap: true,
        manifest: true,
        cssCodeSplit: false,
        rollupOptions: {
            input,
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules') && !id.includes('hammer')) {
                        return 'vendor';
                    }
                    if (id.includes('src/components/')) {
                        return 'vendor';
                    }
                    if (id.includes('windi')) {
                        return 'vendor';
                    }
                },
            },
        },
        assetsDir: '.',
        terserOptions: {
            compress: {
                passes: 10,
            },
        },
    },
});
