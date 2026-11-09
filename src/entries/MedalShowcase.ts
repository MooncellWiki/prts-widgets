import { createApp } from "vue";

import "virtual:uno.css";
import { createStores, pagePinia } from "../utils/pinia";
import MedalShowcase from "../widgets/MedalList/MedalShowcase.vue";

const eles = document.querySelectorAll(
  ".medal-showcase",
) as unknown as HTMLCollectionOf<HTMLElement>;

// 一页上的几个展示共用整页的 pinia：奖章数据（光荣之路/data）只取一次
for (const showcaseEle of Array.from(eles)) {
  const data = showcaseEle.dataset;
  createApp(MedalShowcase, {
    medalList: data.medal ? data.medal.split(";") : [],
    medalGroupList: data.medalgroup ? data.medalgroup.split(";") : [],
    spoiler: data.spoiler !== undefined,
  })
    .use(createStores({ pinia: pagePinia() }))
    .mount(showcaseEle);
}
