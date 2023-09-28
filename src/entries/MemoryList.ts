import "virtual:uno.css";
import { createApp } from "vue";

import { createPinia } from "pinia";

import MemoryList from "../widgets/MemoryList/index.vue";

const ele = document.getElementById("root");
if (ele) createApp(MemoryList, {}).use(createPinia()).mount(ele);
