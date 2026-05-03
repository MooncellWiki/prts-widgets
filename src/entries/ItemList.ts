import "virtual:uno.css";
import { createApp } from "vue";

import ItemList from "../widgets/ItemList/index.vue";

const ele = document.querySelector("#root");
if (ele) createApp(ItemList, {}).mount(ele);
  