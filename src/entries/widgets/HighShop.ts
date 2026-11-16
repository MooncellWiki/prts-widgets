import "virtual:uno.css";
import { createApp } from "vue";

import { createStores, pagePinia } from "@/utils/pinia";
import HighShop from "@/widgets/Shop/HighShop.vue";

// 一页可能挂着好几个商店（含时装商店），共用整页的 pinia，同一份数据只取一次
for (const ele of document.querySelectorAll<HTMLElement>(".prts-high-shop")) {
  createApp(HighShop)
    .use(createStores({ pinia: pagePinia() }))
    .mount(ele);
}
