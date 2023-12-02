import "virtual:uno.css";
import { createApp } from "vue";

import EnemiesListV2 from "../widgets/EnemiesListV2/index.vue";

const ele = document.querySelector("#root");
if (ele) createApp(EnemiesListV2, {}).mount(ele);
