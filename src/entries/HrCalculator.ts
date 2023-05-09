import { createApp } from 'vue'
import 'virtual:windi.css'
import type { Source } from '../widgets/HrCalculator.vue'
import HrCalculator, { BitMap } from '../widgets/HrCalculator.vue'

const ele = document.getElementById('root')
// bitmap的格式是 职业 位置 稀有度 词缀
const profession = ['先锋', '近卫', '狙击', '重装', '医疗', '辅助', '术师', '特种']
const position = ['近战位', '远程位']
const rarity = ['新手', '资深干员', '高级资深干员']
const tag = ['治疗', '支援', '输出', '群攻', '减速', '生存', '防护', '削弱', '位移', '控场', '爆发', '召唤', '快速复活', '费用回复', '支援机械']
function init(): Source[] {
  return (Array.from(document.getElementById('filter-data')?.children || []) as HTMLElement[])
    .filter((v) => {
      return v.dataset.obtain_method?.split(', ').includes('公开招募')
    }).map((v) => {
      const temp: Source = {
        profession: v.dataset.class_!,
        position: v.dataset.position!,
        rarity: parseInt(v.dataset.rarity!),
        tag: v.dataset.tag?.split(' ') || [],
        zh: v.dataset.zh!,
        subset: [],
      }
      let len = temp.tag.length + 2
      if (temp.rarity >= 4)
        len++
      for (let i = 0; i < len; i++) {
        const sub = new BitMap(i)
        const indict = sub.getIndict()
        const set = new BitMap()
        // 这里顺序是没区别的 所有就当是tag，稀有度，位置，职业的顺序
        indict.forEach((index) => {
          if (index === 0) {
            // 职业
            set.set(tag.length + rarity.length + position.length + profession.length - profession.indexOf(temp.profession) - 1)
          }
          if (index === 1) {
            // 位置
            set.set(tag.length + rarity.length + position.length - position.indexOf(temp.position) - 1)
          }
          if (index === 2) {
            // 稀有度
            set.set(tag.length + rarity.length + position.length - position.indexOf(temp.position) - 1)
          }
        })
        temp.subset.push(set)
      }
      return Object.freeze(temp)
    })
}

const source = init()
console.log(source)
if (ele)
  createApp(HrCalculator, { source, profession, position, rarity, tag }).mount(ele)
else
  console.error('data-item or ele not found', ele)
