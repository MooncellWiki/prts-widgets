import { createApp } from "vue";

import { Spine } from "../widgets/SpineViewer/engine/SpineApi";
import SpineViewer from "../widgets/SpineViewer/index.vue";

import type { SpineMeta } from "../widgets/SpineViewer/types";

// @ts-expect-error
window.SpineApi = Spine;
window.dispatchEvent(new Event("spine_api_ready"));

/**
 * 样式来自皮肤：Arknights 皮肤已加载全套，这两个模块是空操作；Vector / Minerva 上
 * 动态加载令牌 + 作用域 + 组件（skins.arknights.components）与官网字体
 * （skins.arknights.fonts：HUD / 帧数读数用的 Bender），挂载前等它们就位。
 * 走 RLQ 而不是直接调 mw.loader.using 的原因见 VoiceTable.ts。
 */
const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];

function main() {
  const ele = document.querySelector<HTMLElement>("#spine-root");
  if (!ele) {
    console.error("SPINEDATA or ele not found", ele);
    return;
  }
  let spineData: SpineMeta | null = null;
  if (!ele.dataset.id) {
    spineData = JSON.parse(
      document.querySelector("#SPINEDATA")!.innerHTML,
    ) as SpineMeta;
    spineData.prefix = spineData.prefix.replace(
      "https://static.prts.wiki/spine/",
      "https://static.prts.wiki/spine38/",
    );
  }

  (window.RLQ = window.RLQ || []).push([
    STYLE_MODULES,
    () => {
      createApp(SpineViewer, { conf: spineData, id: ele.dataset.id }).mount(
        ele,
      );
    },
  ]);
}

main();
