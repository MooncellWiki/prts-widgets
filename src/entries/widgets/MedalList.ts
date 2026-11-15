import "virtual:uno.css";
import { createApp } from "vue";

import { createStores } from "@/utils/pinia";
import MedalList from "@/widgets/MedalList/MedalList.vue";

const ele = document.querySelector("#root");
if (ele) {
  createApp(MedalList, {}).use(createStores()).mount(ele);
}
