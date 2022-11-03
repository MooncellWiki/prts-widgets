import { createApp } from 'vue'
import CharList from '../widgets/CharList.vue'

const ele = document.getElementById('root')
if (ele) {
    createApp(CharList, {}).mount(ele)
}
