import { createApp } from "vue";

import { createPinia } from "pinia";

import CharList from "../widgets/CharList/index.vue";
import { Char, type FilterGroup } from "../widgets/CharList/utils";

const ele = document.querySelector("#root");
const filters = JSON.parse(
  document.querySelector("#filter-filter")?.textContent ?? "",
).filters as FilterGroup[];

const source = Array.from(
  document.querySelector("#filter-data")?.children ?? [],
  (v) => new Char(v as HTMLDivElement),
);

/**
 * 样式来自皮肤：Arknights 皮肤已加载全套，这两个模块是空操作；Vector / Minerva 上
 * 动态加载令牌 + 作用域 + 组件（skins.arknights.components）与官网字体
 * （skins.arknights.fonts：数值 / 代号用的 Bender），挂载前等它们就位。
 * 走 RLQ 而不是直接调 mw.loader.using 的原因见 VoiceTable.ts。
 */
const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];

if (ele) {
  (window.RLQ = window.RLQ || []).push([
    STYLE_MODULES,
    () => {
      createApp(CharList, { filters, source }).use(createPinia()).mount(ele);
    },
  ]);
}
