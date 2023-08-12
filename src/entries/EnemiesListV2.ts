import { createPinia } from 'pinia'
import 'virtual:uno.css'
import { createApp } from 'vue'
import EnemiesListV2 from '../widgets/EnemiesListV2/index.vue'

const ele = document.getElementById('root')
if (ele) {
  const app = createApp(EnemiesListV2, {})
  const pinia = createPinia()
  app.use(pinia)
  app.mount(ele)
}
