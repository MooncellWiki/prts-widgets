import "virtual:uno.css";
import { createApp } from "vue";

import CVList from "@/widgets/CVList/index.vue";

const ele = document.querySelector("#root");
if (ele) {
  createApp(CVList).mount(ele);
}
