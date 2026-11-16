import { createApp } from "vue";

import { createStores } from "@/utils/pinia";
import SOExpCalc from "@/widgets/SOExpCalc/index.vue";

import "virtual:uno.css";

// 经验表在组件里取（SOExpCalc/data.ts），读取中 / 失败 / 重试也在组件里
const ele = document.querySelector<HTMLElement>("#SOEC");
if (!ele) console.error("#SOEC not found");
else if (!ele.dataset.opid)
  console.error("data-opid attribute is missing on #SOEC element");
else
  createApp(SOExpCalc, { opid: ele.dataset.opid })
    .use(createStores())
    .mount(ele);
