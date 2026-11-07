<script setup lang="ts">
import { computed, onMounted, provide, useTemplateRef } from "vue";

import {
  AkButton,
  AkEmpty,
  AkScope,
  AkSpinner,
  AkTab,
  AkTabs,
  AkToastProvider,
} from "@mooncellwiki/prts-design-vue";
import { isClient, useElementSize, useEventListener } from "@vueuse/core";

import ListPager from "@/components/list/ListPager.vue";
import { useHostTheme } from "@/utils/useHostTheme";
import { useHoverTip } from "@/utils/useHoverTip";

import ResourceDetail from "./components/ResourceDetail.vue";
import ResultBar from "./components/ResultBar.vue";
import ResultCards from "./components/ResultCards.vue";
import ResultWall from "./components/ResultWall.vue";
import Toolbar from "./components/Toolbar.vue";
import { createExplorer, explorerKey, readHash } from "./store";
import { RESOURCE_TYPE_OPTIONS, type StoryResourceType } from "./utils";

/**
 * 剧情资源概览（PRTS Design 视觉，排布同干员 / 敌人一览）：
 * 类型页签 → 工具条（搜索 · 排序 · 显示方式 · 角色分类）→ 结果栏（条数 · 已选条件 · 复制链接 · 分页）→ 结果 → 详情对话框。
 * 资源列表与统计由 torappu 的 /api/v1/story-resources/explore 按页返回，搜索 / 排序 / 分类 / 合并均由后端完成；
 * 详情里的使用记录按需取（/api/v1/story-resource-usages + cargo 的 story 表）。
 * .ak-* 是设计系统组件（样式来自皮肤 / skins.arknights.components），.sae-* 是这页自己的排布。
 * 根节点标 ak-not-prose，不吃皮肤的正文排版；data-no-toggle 让皮肤脚本别替芯片翻状态。
 */
const props = defineProps<{
  /** 模板参数：初始的类型 */
  type?: string;
  /** 模板参数：初始的搜索词 */
  id?: string;
}>();

const store = createExplorer({ type: props.type, id: props.id });
provide(explorerKey, store);
const { state, status, error, counts, pageList, page, pageCount, query } =
  store;

/* 分享链接的 # 参数：打开时读一次，之后只在地址栏的 # 变了时再读，不往回写。不带 = 的是页内锚点，不当成清空 */
const loadHash = () => {
  if (location.hash.includes("=")) store.applyHash(readHash(location.hash));
};
if (isClient) loadHash();
useEventListener("hashchange", loadHash);

onMounted(() => store.start());

const theme = useHostTheme();

/* 排布看结果区自己的宽度，不看视口：< 640 是手机排布 */
const root = useTemplateRef<HTMLElement>("root");
const { width } = useElementSize(
  root,
  { width: Number.POSITIVE_INFINITY, height: 0 },
  { box: "border-box" },
);
const narrow = computed(() => width.value < 640);

const activeType = computed({
  get: () => state.type,
  set: (value: StoryResourceType) => store.setType(value),
});

/** 页签数字由同一次浏览响应给出；请求中先空着，避免显示旧筛选的数量 */
function tabCount(value: StoryResourceType): string {
  if (status.value !== "done") return "";
  return String(counts.value[value]);
}

/** 搜不到时，别的类型里有没有 */
const elsewhere = computed(() =>
  RESOURCE_TYPE_OPTIONS.filter(
    (option) => option.value !== state.type && counts.value[option.value] > 0,
  ),
);

/* 在底部翻页：回到结果开头 */
const result = useTemplateRef<HTMLElement>("result");
function toPage(n: number) {
  store.setPage(n);
  result.value?.scrollIntoView({ block: "start" });
}

const { tip, handlers: tipHandlers } = useHoverTip(
  useTemplateRef<HTMLElement>("bubble"),
  "[data-tip]",
);
</script>

<template>
  <AkScope class="sae ak-not-prose" :theme="theme" data-no-toggle>
    <AkToastProvider>
      <div
        ref="root"
        :class="['sae-root', { 'sae--narrow': narrow }]"
        v-on="tipHandlers"
      >
        <AkTabs v-model="activeType" label="资源类型" class="sae-tabs">
          <AkTab
            v-for="option in RESOURCE_TYPE_OPTIONS"
            :key="option.value"
            :name="option.value"
          >
            {{ option.label }}<small>{{ tabCount(option.value) }}</small>
          </AkTab>
        </AkTabs>

        <Toolbar />
        <ResultBar :narrow="narrow" />

        <div ref="result" class="sae-result" :aria-busy="status === 'loading'">
          <AkSpinner
            v-if="status === 'idle' || status === 'loading'"
            description="正在读取剧情资源…"
          />
          <AkEmpty
            v-else-if="status === 'error'"
            icon="warn"
            title="剧情资源读取失败"
            :description="error"
          >
            <AkButton variant="link" @click="store.reload()"> 重试 </AkButton>
          </AkEmpty>
          <AkEmpty
            v-else-if="pageList.length === 0"
            icon="search"
            :title="
              query.terms.length > 0
                ? `没有名字里带「${query.terms.join(' ')}」的资源`
                : '没有符合条件的资源'
            "
          >
            <template v-if="elsewhere.length > 0">
              <span>在</span>
              <template v-for="(option, i) in elsewhere" :key="option.value">
                <template v-if="i > 0">、</template>
                <AkButton variant="link" @click="activeType = option.value">
                  {{ option.label }}（{{ counts[option.value] }}）
                </AkButton>
              </template>
              <span>里有。</span>
            </template>
            <template v-else>
              可以换个关键字，或者<AkButton
                variant="link"
                @click="store.reset()"
                >清除全部条件</AkButton
              >。
            </template>
          </AkEmpty>
          <ResultWall v-else-if="state.view === 'wall'" />
          <ResultCards v-else />
        </div>

        <div class="sae-foot">
          <ListPager
            :page="page"
            :page-count="pageCount"
            label="分页（底部）"
            :narrow="narrow"
            @update:page="toPage"
          />
        </div>
      </div>

      <ResourceDetail />

      <div
        v-if="tip"
        ref="bubble"
        class="ak-tooltip sae-tip"
        role="tooltip"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
      >
        {{ tip.text }}
      </div>
    </AkToastProvider>
  </AkScope>
</template>

<style scoped lang="scss">
// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底
.sae.ak-scope[data-theme] {
  background-color: transparent;
}

.sae-tabs {
  margin-bottom: var(--ak-space-3);

  :deep(.ak-tab small) {
    font-variant-numeric: tabular-nums;
  }
}

// 页眉吸顶只有 Arknights 皮肤有：翻页回到结果开头时让出页眉
.sae-result {
  min-height: 160px;
  scroll-margin-top: var(--ak-space-3);

  .skin-arknights & {
    scroll-margin-top: calc(var(--ak-header-h) + var(--ak-space-3));
  }
}

.sae-foot {
  display: flex;
  justify-content: flex-end;
  margin: var(--ak-space-4) 0 0;

  .sae--narrow & {
    justify-content: center;
  }
}

// 小图的提示：按视口定位，资源名是等宽字
.sae-tip.ak-tooltip {
  position: fixed;
  max-width: min(340px, calc(100vw - 16px));
  white-space: pre-line;
  line-height: 1.55;
  overflow-wrap: anywhere;
  pointer-events: none;
}
</style>
