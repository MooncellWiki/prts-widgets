import "virtual:uno.css";
import { createApp } from "vue";

import { createStores } from "../utils/pinia";
import EquipList from "../widgets/EquipList/index.vue";

const ele = document.querySelector("#root");
if (ele) createApp(EquipList, {}).use(createStores()).mount(ele);
