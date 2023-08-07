import 'virtual:uno.css'
import { createApp } from 'vue'
import XbMapViewer from '../widgets/XbMapViewer/XbMapViewer.vue'

const ele = document.getElementById('root')
const data = document.getElementById('MAPDATA')?.innerText
if (!ele && !data) {
  console.error('data or ele not found', ele, data)
}
else {
  (window.RLQ = window.RLQ || []).push(['ext.gadget.tippy', () => {
    createApp(XbMapViewer, {
      map: JSON.parse(data!),
    }).mount(ele!)
  }])
}
