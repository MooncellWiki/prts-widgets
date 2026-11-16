import "virtual:uno.css";
import { createApp } from "vue";

import { createStores, pagePinia } from "@/utils/pinia";
import SkinShop from "@/widgets/Shop/SkinShop.vue";

// 一页可能挂着好几个商店（含高级凭证区），共用整页的 pinia，同一份数据只取一次
for (const ele of document.querySelectorAll<HTMLElement>(".prts-skin-shop")) {
  createApp(SkinShop)
    .use(createStores({ pinia: pagePinia() }))
    .mount(ele);
}
