import { createApp } from 'vue'
import 'virtual:windi.css'
import ISEventFramework from '../widgets/ISEvents/ISEventFramework.vue'
import ISEventCategory from '../widgets/ISEvents/ISEventCategory.vue'

// 数据表元素（根层级）
const eventDataRoot = document.getElementById('IS-event-data-root')
// 事件场景表元素组
const eventEles = eventDataRoot?.getElementsByClassName(
  'IS-event-data',
) as HTMLCollectionOf<HTMLElement>

const ISTheme = eventDataRoot?.dataset?.theme

// nav app
const navArea = document.getElementById('IS-event-nav')
const sceneCategoryData: string[][] = []
const sceneCategoryTabList: string[] = []

// events app
Array.from(eventEles).forEach((eventEle) => {
  const scenes = (Array.from(eventEle.children) as HTMLElement[]).map(
    (scene) => {
      const data = scene.dataset
      return {
        etype: data.etype,
        name: data.name,
        nav: data.nav,
        index: data.index,
        image: data.image,
        text: scene.firstElementChild?.innerHTML,
        options: (
          Array.from(scene.getElementsByClassName('choose')) as HTMLElement[]
        ).map((choose, index) => {
          const chooseData = choose.dataset
          return {
            title: chooseData.title,
            type: chooseData.type,
            icon: chooseData.icon,
            desc1: choose.getElementsByClassName('desc1')[0]?.innerHTML,
            desc2: choose.getElementsByClassName('desc2')[0]?.innerHTML,
            dest: chooseData.dest,
            index,
          }
        }),
      }
    },
  )
  // add new Category
  if (scenes[0].etype) {
    sceneCategoryTabList.push(scenes[0].etype)
    sceneCategoryData.push([])
  }
  sceneCategoryData[sceneCategoryData.length - 1].push(scenes[0].name || '？？？')
  // creat event
  createApp(ISEventFramework, {
    sceneData: scenes,
    ISTheme,
  }).mount(eventEle)
})

createApp(ISEventCategory, {
  eventNameList: sceneCategoryData,
  tabList: sceneCategoryTabList,
}).mount(navArea!)
