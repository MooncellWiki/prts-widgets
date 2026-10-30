import { createApp } from "vue";

import NpcPortrait from "../widgets/NpcPortrait/index.vue";
import { observePortraits } from "../widgets/NpcPortrait/observe";

// 模板:角色考据 在每个条目里放一个占位：
// <div class="npc-portrait" data-keys="avg_npc_048,avg_npc_1360" data-exclude="…" data-files="…" data-name="…">
function mount(element: HTMLElement): void {
  const { keys = "", exclude = "", files = "", name = "" } = element.dataset;
  createApp(NpcPortrait, { keys, exclude, files, name }).mount(element);
}

const seen = new WeakSet<Element>();
observePortraits(document, mount, seen);

// 实时预览等异步插入的正文
window.mw
  ?.hook?.("wikipage.content")
  .add(($content: ArrayLike<HTMLElement>) => {
    if ($content[0]) observePortraits($content[0], mount, seen);
  });
