import { createApp } from "vue";

import "virtual:uno.css";

import StoryPlayerDebugShell from "../widgets/StoryPlayer/components/StoryPlayerDebugShell.vue";

/**
 * StoryPlayer 独立调试入口：不依赖 prts.wiki 宿主页，按路径从
 * torappu.prts.wiki 拉剧情 txt 播放。页面逻辑（路径/行号工具栏、seek
 * 编排、原始脚本面板）在 StoryPlayerDebugShell.vue；宿主页面由
 * debug/StoryPlayer.html 提供（仅 dev server 使用，不在 templates/
 * 里，不会构建/同步到 wiki）。
 */

const ele = document.querySelector<HTMLElement>("#root");
if (ele) {
  createApp(StoryPlayerDebugShell).mount(ele);
} else {
  console.error("#root not found");
}
