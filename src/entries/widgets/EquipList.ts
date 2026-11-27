import "virtual:uno.css";
import { createApp } from "vue";

import { createPinia } from "pinia";

import { createStores, prefetch } from "@/utils/pinia";
import { equipListQuery } from "@/widgets/EquipList/equipData";
import EquipList from "@/widgets/EquipList/index.vue";

const ele = document.querySelector("#root");

const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];

if (ele) {
  const pinia = createPinia();
  const app = createApp(EquipList).use(createStores({ pinia }));
  prefetch(pinia, equipListQuery);
  (window.RLQ = window.RLQ || []).push([STYLE_MODULES, () => app.mount(ele)]);
} else console.error("#root not found");
