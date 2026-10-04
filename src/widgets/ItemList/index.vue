<script setup lang="ts">
import { computed, useTemplateRef } from "vue";

import {
  AkButton,
  AkEmpty,
  AkScope,
  AkToastProvider,
} from "@mooncellwiki/prts-design-vue";
import { useElementSize, useEventListener } from "@vueuse/core";
import { storeToRefs } from "pinia";

import ListPager from "@/components/list/ListPager.vue";
import { useHostTheme } from "@/utils/useHostTheme";
import { useHoverTip } from "@/utils/useHoverTip";

import ResultBar from "./ResultBar.vue";
import Toolbar from "./Toolbar.vue";
import { View } from "./consts";
import FilterPanel from "./filter/FilterPanel.vue";
import ResultGrid from "./result/ResultGrid.vue";
import ResultList from "./result/ResultList.vue";
import { useItemListStore } from "./store";

import type { Item } from "./item";

/**
 * 道具一览（PRTS Design 视觉，排布同干员一览）：
 * 筛选 → 工具条（搜索 · 排序 · 显示方式）→ 结果栏（条数 · 已选条件 · 复制链接 · 分页）→ 结果。
 * .ak-* 是设计系统组件（样式来自皮肤 / skins.arknights.components），.il-* 是这页自己的排布（各组件的 scoped 样式）。
 * 状态都在 store.ts（pinia）里；根节点标 ak-not-prose，不吃皮肤的正文排版。
 */
const props = defineProps<{
  source: Item[];
}>();

const store = useItemListStore();
store.init(props.source);
const { state } = store;
const { list, page, pageCount } = storeToRefs(store);

useEventListener(window, "hashchange", store.syncFromHash);

const theme = useHostTheme();

/* 排布看结果区自己的宽度，不看视口（侧栏收起 / 展开都会改变它）：< 860 列表折成卡片，< 640 是手机排布 */
const root = useTemplateRef<HTMLElement>("root");
// 挂载前（含外壳预渲染）是 +∞：先按最宽的排布出
const { width } = useElementSize(
  root,
  { width: Number.POSITIVE_INFINITY, height: 0 },
  { box: "border-box" },
);

/* 在底部翻页：回到结果开头 */
const result = useTemplateRef<HTMLElement>("result");
function toPage(n: number) {
  store.setPage(n);
  result.value?.scrollIntoView({ block: "start" });
}

/* 图标视图的提示：锚点的 data-tip 是道具的次序号 */
const { tip, handlers: tipHandlers } = useHoverTip(
  useTemplateRef<HTMLElement>("bubble"),
  ".il-cell[data-tip]",
);
const tipItem = computed(() =>
  tip.value ? props.source[Number(tip.value.text)] : undefined,
);
</script>

<template>
  <AkScope class="il ak-not-prose" :theme="theme">
    <AkToastProvider>
      <div
        ref="root"
        :class="[
          'il-root',
          { 'il--narrow': width < 640, 'il--compact': width < 860 },
        ]"
        v-on="tipHandlers"
      >
        <FilterPanel :narrow="width < 640" />
        <Toolbar />
        <ResultBar :narrow="width < 640" />

        <div ref="result" class="il-result">
          <AkEmpty v-if="list.length === 0" title="没有符合条件的道具">
            放宽几项筛选条件，或者<AkButton
              variant="link"
              @click="store.reset()"
            >
              清除全部条件</AkButton
            >。
          </AkEmpty>
          <ResultList v-else-if="state.view === View.LIST" />
          <ResultGrid v-else />
        </div>

        <div class="il-foot">
          <ListPager
            :page="page"
            :page-count="pageCount"
            label="分页（底部）"
            :narrow="width < 640"
            @update:page="toPage"
          />
        </div>
      </div>

      <!-- 用途 / 描述是模板输出的 wikitext 解析结果，原样放回 -->
      <div
        v-if="tip && tipItem"
        ref="bubble"
        class="ak-tooltip il-tip"
        role="tooltip"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
      >
        <b class="il-tip__name">{{ tipItem.name }}</b>
        <p v-if="tipItem.usage" v-html="tipItem.usageHtml" />
        <p
          v-if="tipItem.description"
          class="il-tip__desc"
          v-html="tipItem.descriptionHtml"
        />
        <p v-if="tipItem.obtain.length > 0" class="il-tip__obtain">
          <span>获取途径</span>{{ tipItem.obtain.join("、") }}
        </p>
      </div>
    </AkToastProvider>
  </AkScope>
</template>

<style scoped lang="scss">
// 窄排布不用 @media：看的是结果区自己的宽度（根节点的 .il--narrow / .il--compact），各组件的样式里用 `.il--narrow &` 接

// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底
.il.ak-scope[data-theme] {
  background-color: transparent;
}

// 页眉吸顶只有 Arknights 皮肤有：翻页回到结果开头时让出页眉
.il-result {
  scroll-margin-top: var(--ak-space-3);

  .skin-arknights & {
    scroll-margin-top: calc(var(--ak-header-h) + var(--ak-space-3));
  }
}

.il-foot {
  display: flex;
  justify-content: flex-end;
  margin: var(--ak-space-4) 0 0;

  .il--narrow & {
    justify-content: center;
  }
}

// 道具提示：按视口定位，不吃指针事件（里面的链接点不到，要点进列表视图或道具页）
.il-tip.ak-tooltip {
  position: fixed;
  display: grid;
  gap: 4px;
  max-width: min(340px, calc(100vw - 16px));
  padding: 8px 12px;
  line-height: 1.55;
  pointer-events: none;

  p {
    margin: 0;
  }
}

.il-tip__name {
  font-size: var(--ak-fs-sm);
}

// 描述是游戏里的风味文字，比用途弱一级
.il-tip__desc,
.il-tip__obtain {
  opacity: 0.72;
}

.il-tip__obtain > span {
  margin-right: 8px;
  font-weight: 600;
}
</style>
