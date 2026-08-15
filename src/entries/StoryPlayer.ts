import { createApp } from "vue";

import "virtual:uno.css";
import StoryPlayer from "../widgets/StoryPlayer/index.vue";

// 同页的旧版剧情模拟器会加载 krliov.toolbox.js
// （static.prts.wiki/assets/scenario/krliov.toolbox.js），其中用裸赋值给各原型
// 挂了一组可枚举补丁。pixi 的 AbstractRenderer._addSystems 以 for...in 遍历
// system 数组，Array.prototype 上的补丁函数会被当成 system 类（val.value ===
// undefined），抛出 "ClassRef is not a constructor"。这里按 toolbox 的补丁清单
// 把这些属性还原为不可枚举（与原生原型方法一致）：属性访问不受影响，toolbox
// 之后再用裸赋值更新这些属性时也会保留不可枚举。
const toolboxPrototypePatches: ReadonlyArray<readonly [object, string[]]> = [
  [Array.prototype, ["empty", "getSum", "last", "removeEmpty"]],
  [String.prototype, ["getValue", "getKey", "getPx", "toObject", "toArray"]],
  [
    HTMLElement.prototype,
    ["fadeIn", "fadeOut", "hide", "show", "setClear", "setHide", "setShow"],
  ],
  [HTMLAudioElement.prototype, ["reset", "dispose", "fade"]],
  [Math, ["clamp"]],
];

for (const [proto, keys] of toolboxPrototypePatches) {
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (!descriptor?.enumerable) continue;
    Object.defineProperty(proto, key, { ...descriptor, enumerable: false });
  }
}

const ele = document.querySelector<HTMLElement>("#root");
// 剧情 txt 已由页面内嵌进 #datas_txt，不再按 path 单独请求
const script =
  document.querySelector<HTMLElement>("#datas_txt")?.textContent?.trim() ?? "";
if (ele && script) {
  createApp(StoryPlayer, { script }).mount(ele);
} else {
  console.error("datas_txt or ele not found", ele);
}
