import { createApp } from 'vue'
import Cookies from 'js-cookie'
import CharList from '../widgets/CharList.vue'

const ele = document.getElementById('root')
const filters = JSON.parse(
  document.getElementById('filter-filter')?.innerText ?? '',
).filters
const filterMap = JSON.parse(
  document.getElementById('filter-map')?.innerText ?? '',
).filter_map

const shortLinkMap = JSON.parse(
  document.getElementById('filter-shortLinkMap')?.innerText ?? '',
).map

const getLast = (str: string) => {
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
    const temp: Record<
      string,
      string | Array<string> | Array<number> | Array<Array<string | number>>
    > = {}
    Object.assign(temp, v.dataset)
    temp.tag = (temp.tag as string).split(' ')
    temp.obtain_method = (temp.obtain_method as string).split(' ')
    temp.cost = getLast(temp.cost as string)
    temp.block = getLast(temp.block as string)
    temp.feature = v.innerHTML
    temp.trust = (temp.trust as string).split(',').map((v: string) => {
      if (v.length !== 0) {
        return parseInt(v)
      } else {
        return 0
      }
    })
    temp.potential = (temp.potential as string)
      .split('`')
      .map((v: string) => v.split(','))
    temp.potential[1] = (temp.potential[1] as Array<string>).map((v: string) =>
      parseFloat(v),
    )
    temp.noHtmlFeature = (temp.feature as string).replace(/<[^<>]+>/g, '')
    return Object.freeze(temp)
  },
)

if (ele) {
  const app = createApp(CharList, { filters, source, shortLinkMap, filterMap })
  app.provide('$cookies', Cookies)
  app.mount(ele)
}
