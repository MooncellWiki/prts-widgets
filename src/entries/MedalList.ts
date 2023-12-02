import "virtual:uno.css";
import { createApp } from "vue";

import MedalList from "@/widgets/MedalList/MedalList.vue";

const ele = document.querySelector("#root");
if (ele) {
  createApp(MedalList, {}).mount(ele);
}
