import { createApp } from "vue";

import { PiniaColada } from "@pinia/colada";
import { createPinia } from "pinia";

import StoryAssetExplorer from "../widgets/StoryAssetExplorer/index.vue";

const ele = document.querySelector<HTMLElement>("#root");

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
      createApp(StoryAssetExplorer, {
        type: ele.dataset.type,
        id: ele.dataset.id,
      })
        .use(createPinia())
        .use(PiniaColada)
        .mount(ele);
    },
  ]);
} else {
  console.error("root element not found");
}
