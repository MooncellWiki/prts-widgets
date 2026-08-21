import "virtual:uno.css";
import { createApp } from "vue";

import XbMapViewer from "../widgets/XbMapViewer/XbMapViewer.vue";

const ele = document.querySelector("#root");
const data = document.querySelector("#MAPDATA")?.textContent;
if (!ele && !data) {
  console.error("data or ele not found", ele, data);
} else {
  createApp(XbMapViewer, {
    map: JSON.parse(data!),
  }).mount(ele!);
}
