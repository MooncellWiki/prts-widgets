import "virtual:uno.css";
import { createApp } from "vue";

import MemoryList from "../widgets/MemoryList/index.vue";

const ele = document.querySelector("#root");
if (ele) createApp(MemoryList, {}).mount(ele);
