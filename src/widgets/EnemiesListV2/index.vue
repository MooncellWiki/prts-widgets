<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref, useTemplateRef } from "vue";

import {
  AkButton,
  AkEmpty,
  AkScope,
  AkSpinner,
  AkToastProvider,
} from "@mooncellwiki/prts-design-vue";
import { isClient, useEventListener } from "@vueuse/core";

import { useHostTheme } from "@/utils/useHostTheme";
import { useHoverTip } from "@/utils/useHoverTip";

import Pager from "./Pager.vue";
import ResultBar from "./ResultBar.vue";
import Toolbar from "./Toolbar.vue";
import { View } from "./consts";
import FilterPanel from "./filter/FilterPanel.vue";
import ResultCards from "./result/ResultCards.vue";
import ResultGrid from "./result/ResultGrid.vue";
import ResultTable from "./result/ResultTable.vue";
import { createEnemyList, enemyListKey } from "./store";

import type { EnemyData } from "./enemy";

/**
 * 敌人一览（PRTS Design 视觉，排布同干员一览）：
 * 筛选 → 工具条（搜索 · 排序 · 显示方式）→ 结果栏（条数 · 已选条件 · 复制链接 · 分页）→ 结果。
 * 筛选项与匹配规则对着游戏的敌人图鉴（见 filter.ts），数据是「敌人一览/数据」那份 JSON（入口取好传进来）。
 * .ak-* 是设计系统组件（样式来自皮肤 / skins.arknights.components），.el-* 是这页自己的排布（各组件的 scoped 样式）。
 * 根节点标 ak-not-prose，不吃皮肤的正文排版；data-no-toggle 让皮肤脚本别替模板芯片翻状态。
 */
const props = withDefaults(
  defineProps<{
    source?: EnemyData[];
    /** 敌人数据没取到：结果区出失败提示，不再转圈 */
    failed?: boolean;
  }>(),
  { source: () => [] },
);

const store = createEnemyList(props.source);
provide(enemyListKey, store);
const { enemies, state, list } = store;

/* 分享链接的 # 参数：打开时读一次，之后只在地址栏的 # 变了时再读，不往回写。不带 = 的是页内锚点（#top），不当成清空 */
const loadHash = () => {
  if (location.hash.includes("=")) store.load(location.hash);
};
if (isClient) loadHash();
useEventListener("hashchange", loadHash);

const theme = useHostTheme();

/* 排布看结果区自己的宽度，不看视口（侧栏收起 / 展开都会改变它）：< 1000 表格换卡片，< 640 是手机排布 */
const root = useTemplateRef<HTMLElement>("root");
const width = ref(Number.POSITIVE_INFINITY);
let observer: ResizeObserver | undefined;
onMounted(() => {
  const el = root.value;
  if (!el) return;
  width.value = el.clientWidth;
  observer = new ResizeObserver(() => {
    width.value = el.clientWidth;
  });
  observer.observe(el);
});
onBeforeUnmount(() => observer?.disconnect());

/* 在底部翻页：回到结果开头 */
const result = useTemplateRef<HTMLElement>("result");
const backToResult = () => result.value?.scrollIntoView({ block: "start" });

const reload = () => location.reload();

const { tip, handlers: tipHandlers } = useHoverTip(
  useTemplateRef<HTMLElement>("bubble"),
  "[data-tip]",
);
</script>

<template>
  <AkScope class="el ak-not-prose" :theme="theme" data-no-toggle>
    <AkToastProvider>
      <div
        ref="root"
        :class="['el-root', { 'el--narrow': width < 640 }]"
        v-on="tipHandlers"
      >
        <FilterPanel />
        <Toolbar />
        <ResultBar />

        <div ref="result" class="el-result">
          <AkEmpty v-if="failed" title="敌人数据读取失败">
            <AkButton variant="link" @click="reload">刷新页面</AkButton
            >再试一次。
          </AkEmpty>
          <!-- 外壳预渲染与数据还没回来时 -->
          <AkSpinner
            v-else-if="enemies.length === 0"
            description="正在读取敌人数据…"
          />
          <AkEmpty v-else-if="list.length === 0" title="没有符合条件的敌人">
            放宽几项筛选条件，或者<AkButton
              variant="link"
              @click="store.reset()"
            >
              清除全部条件</AkButton
            >。
          </AkEmpty>
          <ResultGrid v-else-if="state.view === View.GRID" />
          <ResultCards v-else-if="width < 1000" />
          <ResultTable v-else />
        </div>

        <div class="el-foot">
          <Pager label="分页（底部）" @change="backToResult" />
        </div>
      </div>

      <div
        v-if="tip"
        ref="bubble"
        class="ak-tooltip el-tip"
        role="tooltip"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
      >
        {{ tip.text }}
      </div>
    </AkToastProvider>
  </AkScope>
</template>

<style scoped lang="scss">
// 窄排布不用 @media：看的是结果区自己的宽度（根节点的 .el--narrow），各组件的样式里用 `.el--narrow &` 接

// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底
.el.ak-scope[data-theme] {
  background-color: transparent;
}

// 页眉吸顶只有 Arknights 皮肤有：翻页回到结果开头时让出页眉
.el-result {
  scroll-margin-top: var(--ak-space-3);

  .skin-arknights & {
    scroll-margin-top: calc(var(--ak-header-h) + var(--ak-space-3));
  }
}

.el-foot {
  display: flex;
  justify-content: flex-end;
  margin: var(--ak-space-4) 0 0;

  .el--narrow & {
    justify-content: center;
  }
}

// 术语 / 等级提示：按视口定位，不被表格裁掉
.el-tip.ak-tooltip {
  position: fixed;
  max-width: min(340px, calc(100vw - 16px));
  white-space: pre-line;
  line-height: 1.55;
  pointer-events: none;
}
</style>
