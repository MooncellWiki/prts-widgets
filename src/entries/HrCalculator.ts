import { createApp } from 'vue'
import 'virtual:windi.css'
import HrCalculator from '../widgets/HrCalculator.vue'

const ele = document.getElementById('root')
if (ele?.dataset?.item) {
  createApp(HrCalculator, { item: ele.dataset.item }).mount(ele)
} else {
  console.error('data-item or ele not found', ele)
}
