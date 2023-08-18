import "virtual:uno.css";
import { createApp } from "vue";

import { createPinia } from "pinia";

import EnemiesListV2 from "../widgets/EnemiesListV2/index.vue";

const ele = document.getElementById("root");
if (ele) createApp(EnemiesListV2, {}).use(createPinia()).mount(ele);
