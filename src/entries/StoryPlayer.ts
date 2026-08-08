import { createApp } from "vue";

import "virtual:uno.css";
import StoryPlayer from "../widgets/StoryPlayer/index.vue";

const ele = document.querySelector<HTMLElement>("#root");
if (ele?.dataset?.path) {
  createApp(StoryPlayer, { path: ele.dataset.path }).mount(ele);
} else {
  console.error("data-path or ele not found", ele);
}
