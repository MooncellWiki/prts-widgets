import { createApp } from "vue";

import "virtual:uno.css";

import StoryPlayerDebugShell from "../widgets/StoryPlayer/components/StoryPlayerDebugShell.vue";
import {
  installStoryRecorderApi,
  StoryRecorder,
} from "../widgets/StoryPlayer/components/storyRecorder";

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

// 画布抓帧器：暴露 window.__storyRec（见 storyRecorder.ts 文件头）。
// 播放器随换脚本重建，canvas 每次采集现查，录制可跨重建连续。调试页
// 唯一的 canvas 就是播放器画布（抓帧 offscreen 不挂 DOM）。
installStoryRecorderApi(
  new StoryRecorder(() => document.querySelector("canvas")),
);
