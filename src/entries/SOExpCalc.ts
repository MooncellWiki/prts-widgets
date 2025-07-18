import { createApp } from "vue";

import "virtual:uno.css";
import SOExpCalc from "../widgets/SOExpCalc.vue";

const ele = document.querySelector("#SOEC") as HTMLElement | null;
if (ele?.dataset?.exptree) {
  createApp(SOExpCalc, { exptree: ele.dataset.exptree }).mount(ele);
} else {
  console.error("data-exptree or ele not found", ele);
}
