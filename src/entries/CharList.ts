import "virtual:uno.css";
import { createApp } from "vue";

import CharList from "../widgets/CharList/index.vue";
import type { FilterGroup } from "../widgets/CharList/utils";
import { Char } from "../widgets/CharList/utils";

const ele = document.querySelector("#root");
const filters = JSON.parse(
  document.querySelector("#filter-filter")?.textContent ?? "",
).filters as FilterGroup[];

const source = Array.prototype.map.call(
  document.querySelector("#filter-data")?.children,
  (v) => {
    return new Char(v);
  },
) as Char[];

if (ele) {
  const app = createApp(CharList, { filters, source });
  app.mount(ele);
}
