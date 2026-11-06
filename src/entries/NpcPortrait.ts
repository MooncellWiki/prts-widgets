import { createApp } from "vue";

import NpcPortrait from "../widgets/NpcPortrait/index.vue";
import { observePortraits } from "../widgets/NpcPortrait/observe";

/**
 * 样式来自皮肤：Arknights 皮肤上已加载全套，这里是空操作；Vector / Minerva 上动态加载令牌 + 作用域 + 组件。
 * 第一个条目展开时才加载，整页一次。走 RLQ 而不是直接调 mw.loader.using 的原因见 VoiceTable.ts。
 */
const STYLE_MODULES = ["skins.arknights.components"];
let styles: Promise<void> | null = null;
function loadStyles(): Promise<void> {
  styles ??= new Promise((resolve) => {
    (window.RLQ = window.RLQ || []).push([STYLE_MODULES, () => resolve()]);
  });
  return styles;
}

// 模板:角色考据 在每个条目里放一个占位：
// <div class="npc-portrait" data-keys="avg_npc_048,avg_npc_1360" data-exclude="…" data-files="…" data-name="…">
function mount(element: HTMLElement): void {
  const { keys = "", exclude = "", files = "", name = "" } = element.dataset;
  loadStyles().then(() => {
    createApp(NpcPortrait, { keys, exclude, files, name }).mount(element);
  });
}

const seen = new WeakSet<Element>();
observePortraits(document, mount, seen);

// 实时预览等异步插入的正文
window.mw
  ?.hook?.("wikipage.content")
  .add(($content: ArrayLike<HTMLElement>) => {
    if ($content[0]) observePortraits($content[0], mount, seen);
  });
