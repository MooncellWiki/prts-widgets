import { createApp } from 'vue'
import 'virtual:windi.css'
import XbMapViewer from '../widgets/XbMapViewer/XbMapViewer.vue'

const ele = document.getElementById('root')
const data = document.getElementById('MAPDATA')
if (ele && data) {
  createApp(XbMapViewer, {
    data() {
      return JSON.parse(data?.innerText)
    },
  }).mount(ele)
}
else { console.error('data or ele not found', ele) }
