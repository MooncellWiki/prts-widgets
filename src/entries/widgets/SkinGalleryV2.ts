import { createApp } from "vue";

import { createStores, pagePinia } from "@/utils/pinia";
import SkinGallery from "@/widgets/SkinGallery/index.vue";

for (const element of document.querySelectorAll<HTMLElement>(
  ".prts-skin-gallery-v2",
)) {
  createApp(SkinGallery, {
    brand: element.dataset.brand,
    mode: element.dataset.mode,
  })
    .use(createStores({ pinia: pagePinia() }))
    .mount(element);
}
