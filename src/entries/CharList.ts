import { createApp } from 'vue'
import vel from 'velocity-animate'
import Cookies from 'js-cookie'
import CharList from '../widgets/CharList.vue'

const ele = document.getElementById('root')
const filters = JSON.parse(
  document.getElementById('filter-filter')?.innerText ?? '',
).filters

const getLast = (str) => {
  if (str.indexOf('→') !== -1) {
    const arr = str.split('→')
    return arr[arr.length - 1]
  } else {
    return str
  }
}
const source = Array.prototype.map.call(
  document.getElementById('filter-data')?.children,
  (v) => {
    const temp = {}
    Object.assign(temp, v.dataset)
    temp.tag = temp.tag.split(' ')
    temp.obtain_method = temp.obtain_method.split(' ')
    temp.cost = getLast(temp.cost)
    temp.block = getLast(temp.block)
    temp.feature = v.innerHTML
    temp.trust = temp.trust.split(',').map((v) => {
      if (v.length !== 0) {
        return parseInt(v)
      } else {
        return 0
      }
    })
    temp.potential = temp.potential.split('`').map((v) => v.split(','))
    temp.potential[1] = temp.potential[1].map((v) => parseFloat(v))
    temp.noHtmlFeature = temp.feature.replace(/<[^<>]+>/g, '')
    return Object.freeze(temp)
  },
)

if (ele) {
  const app = createApp(CharList, { filters, source })
  app.provide('$vel', vel)
  app.provide('$cookies', Cookies)
  app.mount(ele)
}
