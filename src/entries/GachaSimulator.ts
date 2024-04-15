import "virtual:uno.css";
import { createApp } from "vue";

import GachaSimulator from "../widgets/GachaSimulator/index.vue";

const ele = document.querySelector("#root");
if (ele) createApp(GachaSimulator, {}).mount(ele);
