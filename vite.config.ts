import { readdirSync } from 'fs'
import { join, resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import WindiCSS from 'vite-plugin-windicss'
import { visualizer } from 'rollup-plugin-visualizer'

const entries = readdirSync(join(__dirname, 'src/entries/'))
const input: Record<string, string> = {}
entries.forEach((entry) => {
  input[entry.replace('.ts', '')] = `src/entries/${entry}`
})
// https://vitejs.dev/config/
export default defineConfig({
  base: 'https://static.prts.wiki/widgets/release/',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [
    vue(),
    WindiCSS(),
    visualizer({ sourcemap: true }),
  ],
  server: {
    port: 8080,
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
        sourcemapBaseUrl: 'https://static.prts.wiki/widgets/release/',
        manualChunks(id) {
          if (id.includes('naive-ui'))
            return 'naive-ui'

          if (id.includes('sentry'))
            return 'sentry'

          if (id.includes('node_modules') && !id.includes('hammer'))
            return 'vendor'

          if (id.includes('src/components/'))
            return 'vendor'

          if (id.includes('windi'))
            return 'vendor'
        },
        chunkFileNames: '[name].[hash].js',
        entryFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash].[ext]',
      },
    },
    assetsDir: '.',
    terserOptions: {
      compress: {
        passes: 10,
      },
    },
  },
})
