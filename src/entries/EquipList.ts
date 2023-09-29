import "virtual:uno.css";
import { createApp } from "vue";

import EquipList from "../widgets/EquipList/index.vue";

const ele = document.getElementById("root");
if (ele) createApp(EquipList, {}).mount(ele);
