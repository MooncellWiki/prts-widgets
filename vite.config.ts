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
    port: 18080,
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
          if (id.includes('sentry'))
            return 'sentry'
          if (id.includes('MarkedMap') || id.includes('node_modules/ol'))
            return 'marked-map'
          if (id.includes('naive-ui'))
            return 'naive-ui'

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
      plugins: [
        {
          name: 'prts',
          generateBundle(opts, bundle) {
            const bundles = Object.keys(bundle)
            const vendorFilename = bundles.find(v => v.startsWith('vendor'))!
            const naiveUiFilename = bundles.find(v =>
              v.startsWith('naive-ui'),
            )!
            Object.keys(bundle).forEach((key) => {
              const chunk = bundle[key]
              if (chunk.type !== 'chunk')
                return

              if (chunk.fileName.startsWith('SpineViewer')) {
                // SpineViewer 不需要改导入路径
                return
              }
              chunk.code = chunk.code.replaceAll(
                `./${vendorFilename}`,
                `https://static.prts.wiki/widgets/release/${vendorFilename}`,
              )
              chunk.code = chunk.code.replaceAll(
                `./${naiveUiFilename}`,
                `https://static.prts.wiki/widgets/release/${naiveUiFilename}`,
              )
            })
          },
        },
      ],
    },
    assetsDir: '.',
    terserOptions: {
      compress: {
        passes: 10,
      },
    },
    target: ['chrome70', 'edge81', 'firefox70', 'safari12', 'ios12'],
  },
})
