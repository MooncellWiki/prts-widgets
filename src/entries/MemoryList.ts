import "virtual:uno.css";
import { createApp } from "vue";

import { createStores } from "../utils/pinia";
import MemoryList from "../widgets/MemoryList/index.vue";

const ele = document.querySelector("#root");
if (ele) createApp(MemoryList, {}).use(createStores()).mount(ele);
