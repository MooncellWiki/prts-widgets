import { createApp } from 'vue'
import vel from 'velocity-animate'
import Cookies from 'js-cookie'
import CharList from '../widgets/CharList.vue'

const ele = document.getElementById('root')
const filters = JSON.parse(
    document.getElementById('filter-filter')?.innerText ?? '',
).filters
if (ele) {
    const app = createApp(CharList, { filters })
    app.provide('$vel', vel)
    app.provide('$cookies', Cookies)
    app.mount(ele)
}
