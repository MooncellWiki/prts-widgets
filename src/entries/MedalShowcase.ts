import { createApp } from "vue";

import "virtual:uno.css";
import MedalShowcase from "../widgets/MedalList/MedalShowcase.vue";

const eles = document.querySelectorAll(
  ".medal-showcase",
) as unknown as HTMLCollectionOf<HTMLElement>;

for (const showcaseEle of Array.from(eles)) {
  const data = showcaseEle.dataset;
  createApp(MedalShowcase, {
    medal: data.medal || "",
    medalGroup: data.medalgroup || "",
    spoiler: (data.spoiler || "") == "true",
  }).mount(showcaseEle);
}
