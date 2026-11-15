import "virtual:uno.css";
import { createApp } from "vue";

import { createStores } from "@/utils/pinia";
import CVList from "@/widgets/CVList/index.vue";

const ele = document.querySelector("#root");
if (ele) {
  createApp(CVList).use(createStores()).mount(ele);
}
