import { createApp } from 'vue'
import CharList from '../widgets/CharList/index.vue'
import type { FilterGroup } from '../widgets/CharList/utils'
import { Char } from '../widgets/CharList/utils'
import 'virtual:windi.css'

const ele = document.getElementById('root')
const filters = JSON.parse(
  document.getElementById('filter-filter')?.innerText ?? '',
).filters as FilterGroup[]
const filterMap = JSON.parse(
  document.getElementById('filter-map')?.innerText ?? '',
)

const shortLinkMap = JSON.parse(
  document.getElementById('filter-shortLinkMap')?.innerText ?? '',
).map

const source = Array.prototype.map.call(
  document.getElementById('filter-data')?.children,
  (v) => {
    return new Char(v)
  },
) as Char[]

if (ele) {
  const app = createApp(CharList, { filters, source, shortLinkMap, filterMap })
  app.mount(ele)
}
