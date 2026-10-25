<script setup lang="ts">
import {
  AkButton,
  AkEmpty,
  AkScope,
  AkSpinner,
  AkToastProvider,
} from "@mooncellwiki/prts-design-vue";

import { useHostTheme } from "@/utils/useHostTheme";

import Main from "./Main.vue";

import type { Source } from "./data";

/**
 * 后勤技能一览（PRTS Design 视觉，排布同干员一览 / 道具一览，设计稿见 prts-design 的 /patterns/riic）：
 * 筛选 → 工具条（搜索 · 排序 · 显示方式）→ 结果栏（条数 · 已选条件 · 复制链接 · 分页）→ 结果。
 * 数据直接读游戏的 building_data（入口取好传进来，见 data.ts）；这一层只管作用域、读取中与失败，其余在 Main.vue。
 * room 指定了设施 = 设施页（罗德岛基建/制造站 …）里嵌着的那份，只看这个设施。
 * 根节点标 ak-not-prose，不吃皮肤的正文排版；data-no-toggle 让皮肤脚本别替芯片翻状态。
 */
withDefaults(
  defineProps<{
    source?: Source;
    /** 游戏数据没取到：出失败提示，不再转圈 */
    failed?: boolean;
    /** 设施的游戏 ID（MANUFACTURE）或名字（制造站） */
    room?: string;
  }>(),
  { source: undefined, room: "" },
);

const theme = useHostTheme();
const reload = () => location.reload();
</script>

<template>
  <AkScope class="rs ak-not-prose" :theme="theme" data-no-toggle>
    <AkToastProvider>
      <AkEmpty v-if="failed" title="后勤技能数据读取失败">
        <AkButton variant="link" @click="reload">刷新页面</AkButton>再试一次。
      </AkEmpty>
      <!-- 外壳预渲染与数据还没回来时 -->
      <AkSpinner v-else-if="!source" description="正在读取后勤技能数据…" />
      <Main v-else :source="source" :room="room" />
    </AkToastProvider>
  </AkScope>
</template>

<style lang="scss">
// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底
.rs.ak-scope[data-theme] {
  background-color: transparent;
}

/*
 * 设施色：每个设施两种颜色，都是游戏自己的——亮色主题用技能名条的底色 buffColor（深、能压白字），
 * 暗色主题用进驻面板技能图标的光环色（亮、在黑底上看得清）。两种都由数据写进 style="--rs-c; --rs-h"（带 data-rc 的元素），这里只选用哪个：
 * 得写在带着这两个变量的元素上，写在外层的话 var(--rs-c) 在外层就解析成空了。
 * 暗色的四种来路 = 令牌的那几条（tokens.css 2c + 跟随系统），再加别的皮肤上 AkScope 的 data-theme。
 */
.rs [data-rc] {
  --rs-room: var(--rs-c);
}

:root[data-theme="dark"] .rs [data-rc],
html.skin-theme-clientpref-night .rs [data-rc],
.rs.ak-scope[data-theme="dark"] [data-rc] {
  --rs-room: var(--rs-h);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]):not(.skin-theme-clientpref-day):not(
      [data-theme="dark"]
    ):not(.skin-theme-clientpref-night)
    .rs:not([data-theme="light"])
    [data-rc] {
    --rs-room: var(--rs-h);
  }
}

// 设施线稿 / 职业线稿：白色线稿当遮罩、填 currentColor（同干员一览的职业图标）
.rs-glyph {
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: center / contain no-repeat;
  mask: center / contain no-repeat;
}
</style>
