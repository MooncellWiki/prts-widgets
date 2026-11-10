import "virtual:uno.css";
import { createApp } from "vue";

import { createStores } from "../utils/pinia";
import ItemDemand from "../widgets/ItemDemand.vue";

const ele = document.querySelector<HTMLElement>("#root");
if (ele?.dataset?.item)
  createApp(ItemDemand, { item: ele.dataset.item })
    .use(createStores())
    .mount(ele);
else console.error("data-item or ele not found", ele);
