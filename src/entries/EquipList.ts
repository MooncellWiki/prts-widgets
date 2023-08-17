import 'virtual:uno.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import EquipList from '../widgets/EquipList/index.vue'

const ele = document.getElementById('root')
if (ele)
  createApp(EquipList, {}).use(createPinia()).mount(ele)
