import { readdirSync } from 'fs'
import { resolve, join } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import WindiCSS from 'vite-plugin-windicss'
import { visualizer } from 'rollup-plugin-visualizer'
const entries = readdirSync(join(__dirname, 'src/entries/'))
const input = {}
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
  plugins: [vue(), WindiCSS(), visualizer({ sourcemap: true })],
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
        manualChunks(id) {
          if (id.includes('naive-ui')) {
            return 'naive-ui'
          }
          if (id.includes('sentry')) {
            return 'sentry'
          }
          if (id.includes('node_modules') && !id.includes('hammer')) {
            return 'vendor'
          }
          if (id.includes('src/components/')) {
            return 'vendor'
          }
          if (id.includes('windi')) {
            return 'vendor'
          }
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
            const cssFilename = bundles.find((v) => v.startsWith('style'))
            const vendorFilename = bundles.find((v) => v.startsWith('vendor'))
            const naiveUiFilename = bundles.find((v) =>
              v.startsWith('naive-ui'),
            )

            const vendor = bundle[vendorFilename]
            const css = bundle[cssFilename]
            if (css.type !== 'asset' || vendor.type !== 'chunk') {
              return
            }
            const cssStr = JSON.stringify({
              c: css.source as string,
            })
            const IIFEcss = `(function(){try{var elementStyle=document.createElement('style');elementStyle.type='text/css';var cssStr=${cssStr};elementStyle.innerText=cssStr.c;document.head.appendChild(elementStyle);}catch(error){console.error(error,'unable to concat style inside the bundled file');}})();`
            vendor.code = IIFEcss + vendor.code
            // remove from final bundle
            delete bundle[cssFilename]
            Object.keys(bundle).forEach((key) => {
              const chunk = bundle[key]
              if (chunk.type !== 'chunk') {
                return
              }
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
  },
})
