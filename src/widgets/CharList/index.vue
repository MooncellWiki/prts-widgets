<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";

import {
  AkButton,
  AkEmpty,
  AkScope,
  AkToastProvider,
} from "@mooncellwiki/prts-design-vue";
import { useEventListener } from "@vueuse/core";
import { storeToRefs } from "pinia";

import Pager from "./Pager.vue";
import ResultBar from "./ResultBar.vue";
import Toolbar from "./Toolbar.vue";
import { View } from "./consts";
import FilterPanel from "./filter/FilterPanel.vue";
import ResultCards from "./result/ResultCards.vue";
import ResultGrid from "./result/ResultGrid.vue";
import ResultTable from "./result/ResultTable.vue";
import { useCharListStore } from "./store";
import { useHostTheme } from "./useHostTheme";
import { useTermTip } from "./useTermTip";

import type { Char, FilterGroup } from "./utils";

import "./style.css";

/**
 * 干员一览（PRTS Design 视觉，对应设计稿 /patterns/operators）：
 * 筛选 → 工具条（搜索 · 排序 · 数值加算 · 显示方式）→ 结果栏（条数 · 已选条件 · 短链接 · 分页）→ 结果。
 * .ak-* 是设计系统组件（样式来自皮肤 / skins.arknights.components），.ol-* 是这页自己的排布（style.css）。
 * 状态都在 store.ts（pinia）里；根节点标 ak-not-prose，不吃皮肤的正文排版。
 */
const props = defineProps<{
  filters: FilterGroup[];
  source: Char[];
}>();

const store = useCharListStore();
store.init(props.filters, props.source);
const { state } = store;
const { list } = storeToRefs(store);

useEventListener(window, "hashchange", store.syncFromHash);

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

/* 头像 / 半身像取不到（还没上传）：藏掉破图，留下深色底框 */
function onImageError(e: Event) {
  if (e.target instanceof HTMLImageElement)
    e.target.style.visibility = "hidden";
}

const { tip, handlers: tipHandlers } = useTermTip(
  useTemplateRef<HTMLElement>("bubble"),
);
</script>

<template>
  <AkScope class="ol ak-not-prose" :theme="theme">
    <AkToastProvider>
      <div
        ref="root"
        :class="['ol-root', { 'ol--narrow': width < 640 }]"
        v-on="tipHandlers"
      >
        <FilterPanel :narrow="width < 640" />
        <Toolbar />
        <ResultBar />

        <div ref="result" class="ol-result" @error.capture="onImageError">
          <AkEmpty v-if="list.length === 0" title="没有符合条件的干员">
            放宽几项筛选条件，或者<AkButton
              variant="link"
              @click="store.reset()"
            >
              清除全部条件</AkButton
            >。
          </AkEmpty>
          <ResultGrid v-else-if="state.view === View.HALF" half />
          <ResultGrid v-else-if="state.view === View.AVATAR" />
          <ResultCards v-else-if="width < 1000" />
          <ResultTable v-else />
        </div>

        <div class="ol-foot">
          <Pager label="分页（底部）" @change="backToResult" />
        </div>
      </div>

      <div
        v-if="tip"
        ref="bubble"
        class="ak-tooltip ol-tip"
        role="tooltip"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
      >
        {{ tip.text }}
      </div>
    </AkToastProvider>
  </AkScope>
</template>
