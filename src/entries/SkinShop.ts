import "virtual:uno.css";
import { createApp } from "vue";

import SkinShop from "@/widgets/Shop/SkinShop.vue";

for (const ele of document.querySelectorAll<HTMLElement>(".prts-skin-shop")) {
  createApp(SkinShop).mount(ele);
}
