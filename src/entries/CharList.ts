import "virtual:uno.css";
import { createApp } from "vue";

import CharList from "../widgets/CharList/index.vue";
import type { FilterGroup } from "../widgets/CharList/utils";
import { Char } from "../widgets/CharList/utils";

const ele = document.getElementById("root");
const filters = JSON.parse(
  document.getElementById("filter-filter")?.innerText ?? "",
).filters as FilterGroup[];

const source = Array.prototype.map.call(
  document.getElementById("filter-data")?.children,
  (v) => {
    return new Char(v);
  },
) as Char[];

if (ele) {
  const app = createApp(CharList, { filters, source });
  app.mount(ele);
}
