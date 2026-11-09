import { createApp } from "vue";

import { createPinia } from "pinia";

import { createStores, prefetch } from "../utils/pinia";
import HrCalculator from "../widgets/HrCalculator/index.vue";
import { recruitSourceQuery } from "../widgets/HrCalculator/source";

const ele = document.querySelector("#root");

/**
 * 样式来自皮肤：Arknights 皮肤已加载全套，这两个模块是空操作；Vector / Minerva 上
 * 动态加载令牌 + 作用域 + 组件（skins.arknights.components）与官网字体
 * （skins.arknights.fonts：星级 / 计数用的 Bender），挂载前等它们就位。
 * 数据与样式并行取：挂载前先 prefetch，组件里的 useQuery 接上同一个请求，读取中 / 失败 / 重试都在组件里。
 * 走 RLQ 而不是直接调 mw.loader.using 的原因见 VoiceTable.ts。
 */
const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];

if (ele) {
  const pinia = createPinia();
  const app = createApp(HrCalculator).use(createStores({ pinia }));
  prefetch(pinia, recruitSourceQuery);
  (window.RLQ = window.RLQ || []).push([STYLE_MODULES, () => app.mount(ele)]);
} else console.error("#root not found");
