import { createApp } from "vue";

import "virtual:uno.css";

import StoryAssetExplorer from "../widgets/StoryAssetExplorer/index.vue";

const ele = document.querySelector<HTMLElement>("#root");
if (ele) {
  createApp(StoryAssetExplorer, {
    type: ele.dataset.type,
    id: ele.dataset.id,
  }).mount(ele);
} else {
  console.error("root element not found");
}
