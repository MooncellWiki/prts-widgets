import "virtual:uno.css";
import { createApp } from "vue";

import ISEventCategory from "../widgets/ISEvents/ISEventCategory.vue";
import ISEventFramework from "../widgets/ISEvents/ISEventFramework.vue";

// 数据表元素（根层级）
const eventDataRoot = document.querySelector<HTMLElement>(
  "#IS-event-data-root",
);
// 事件场景表元素组
const eventEles = eventDataRoot?.getElementsByClassName(
  "IS-event-data",
) as HTMLCollectionOf<HTMLElement>;

const isTheme = eventDataRoot?.dataset?.theme;

// nav app
const navArea = document.querySelector("#IS-event-nav");
const sceneCategoryData: string[][] = [];
const sceneCategoryFloorData: string[][][] = [];
const sceneCategoryTabList: string[] = [];

// events app
for (const eventEle of Array.from(eventEles)) {
  const scenes = (Array.from(eventEle.children) as HTMLElement[]).map(
    (scene) => {
      const data = scene.dataset;
      return {
        etype: data.etype,
        edesc: scene.querySelectorAll(".edesc")[0]?.innerHTML,
        name: data.name,
        ename: data.ename,
        floors: (data.floor || "")
          .split(",")
          .map((floor) => floor.trim())
          .filter(Boolean),
        nav: data.nav,
        index: data.index,
        image: data.image,
        text: scene.firstElementChild?.innerHTML,
        options: (
          Array.from(scene.querySelectorAll(".choose")) as HTMLElement[]
        ).map((choose, index) => {
          const chooseData = choose.dataset;
          return {
            title: chooseData.title,
            type: chooseData.type,
            icon: chooseData.icon,
            iconId: chooseData.iconid,
            desc1: choose.querySelectorAll(".desc1")[0]?.innerHTML,
            desc2: choose.querySelectorAll(".desc2")[0]?.innerHTML,
            dest: Number.parseInt(chooseData.dest || "0"),
            customBadgeText:
              choose.querySelectorAll(".customBadgeText")[0]?.innerHTML,
            subChoose: chooseData.subchoose,
            index,
          };
        }),
        prtsinfo: data.prtsinfo,
      };
    },
  );
  // add new Category
  if (scenes[0].etype) {
    sceneCategoryTabList.push(scenes[0].etype);
    sceneCategoryData.push([]);
    sceneCategoryFloorData.push([]);
  }
  const eventType = sceneCategoryTabList.at(-1) || "";
  sceneCategoryData.at(-1)?.push(scenes[0].ename || scenes[0].name || "？？？");
  sceneCategoryFloorData.at(-1)?.push(scenes[0].floors);
  // creat event
  createApp(ISEventFramework, {
    sceneData: scenes,
    eventType,
    isTheme,
  }).mount(eventEle);
}

createApp(ISEventCategory, {
  eventNameList: sceneCategoryData,
  eventFloorList: sceneCategoryFloorData,
  tabList: sceneCategoryTabList,
}).mount(navArea!);
