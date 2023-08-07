import presetUno from '@unocss/preset-uno'
import { defineConfig } from 'unocss'

export default defineConfig({
  presets: [presetUno()],

  shortcuts: {
    img: 'border-solid block align-middle max-w-full h-auto',
  },
  theme: {
    breakpoints: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    colors: {
      'divider': '#a2a9b1',
      'primary-light': '#22bbff',
      'disabled': '#9d9d9d',
      'paper': '#f8f8f8',
      'primary-main': '#6a6aff',
      'table': '#eaebee',
      'wikitable': '#f8f9fa',
      'ooui-primary': '#2a4b8d',
    },
  },
})
