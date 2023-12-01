/* eslint-disable vue/one-component-per-file */
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
const sceneCategoryTabList: string[] = [];

// events app
for (const eventEle of Array.from(eventEles)) {
  const scenes = (Array.from(eventEle.children) as HTMLElement[]).map(
    (scene) => {
      const data = scene.dataset;
      return {
        etype: data.etype,
        name: data.name,
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
            desc1: choose.querySelectorAll(".desc1")[0]?.innerHTML,
            desc2: choose.querySelectorAll(".desc2")[0]?.innerHTML,
            dest: chooseData.dest,
            index,
          };
        }),
      };
    },
  );
  // add new Category
  if (scenes[0].etype) {
    sceneCategoryTabList.push(scenes[0].etype);
    sceneCategoryData.push([]);
  }
  sceneCategoryData.at(-1)?.push(scenes[0].name || "？？？");
  // creat event
  createApp(ISEventFramework, {
    sceneData: scenes,
    isTheme,
  }).mount(eventEle);
}

createApp(ISEventCategory, {
  eventNameList: sceneCategoryData,
  tabList: sceneCategoryTabList,
}).mount(navArea!);
