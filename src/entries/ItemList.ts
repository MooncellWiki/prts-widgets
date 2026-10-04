import { createApp } from "vue";

import { createPinia } from "pinia";

import ItemList from "../widgets/ItemList/index.vue";
import { readItems } from "../widgets/ItemList/item";

const ele = document.querySelector("#root");
/** 道具数据：页面上 #cargo-data 里 模板:道具筛选数据2 输出的每件道具一条 */
const source = readItems(document.querySelector("#cargo-data"));

/**
 * 样式来自皮肤：Arknights 皮肤已加载全套，这两个模块是空操作；Vector / Minerva 上
 * 动态加载令牌 + 作用域 + 组件（skins.arknights.components）与官网字体
 * （skins.arknights.fonts：条数用的 Bender），挂载前等它们就位。
 * 走 RLQ 而不是直接调 mw.loader.using 的原因见 VoiceTable.ts。
 */
const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];

if (ele) {
  (window.RLQ = window.RLQ || []).push([
    STYLE_MODULES,
    () => {
      createApp(ItemList, { source }).use(createPinia()).mount(ele);
    },
  ]);
}
