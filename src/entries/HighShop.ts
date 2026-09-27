import "virtual:uno.css";
import { createApp } from "vue";

import HighShop from "@/widgets/Shop/HighShop.vue";

for (const ele of document.querySelectorAll<HTMLElement>(".prts-high-shop")) {
  createApp(HighShop).mount(ele);
}
