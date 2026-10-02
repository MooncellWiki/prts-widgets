<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  useTemplateRef,
  watch,
} from "vue";

import { AkScope, AkToastProvider } from "@mooncellwiki/prts-design-vue";
import { isClient, useEventListener } from "@vueuse/core";

import { useHostTheme } from "@/utils/useHostTheme";
import { useHoverTip } from "@/utils/useHoverTip";

import RecruitTips from "./RecruitTips.vue";
import ResultView from "./ResultView.vue";
import TagPanel from "./TagPanel.vue";
import VerdictBar from "./VerdictBar.vue";
import { createRecruit, recruitKey } from "./store";
import { writeQuery } from "./url";

import type { Source } from "./recruit";

/**
 * 公招计算（PRTS Design 视觉，对应设计稿 /patterns/recruit）。照游戏的招募流程排：
 * 标签面板（最多 5 个，= 招募位上的 5 格）+ 招募时限（三档，决定稀有度范围）→ 提示 → 结论 → 按「保底几星」分层的组合（每组至多 3 个标签）；
 * 一个标签都没选时，结果区是保底速查。
 * .ak-* 是设计系统组件（样式来自皮肤 / skins.arknights.components），.hr-* 是这页自己的排布（各组件的 scoped 样式）。
 * 根节点标 ak-not-prose，不吃皮肤的正文排版；data-no-toggle 让皮肤脚本别替模板芯片翻状态。
 */
const props = withDefaults(defineProps<{ source?: Source[] }>(), {
  source: () => [],
});

const recruit = createRecruit(props.source);
provide(recruitKey, recruit);
const { state } = recruit;

/* 地址栏：?filter= 同旧版、?t= 时限；改了就就地换掉（不加历史记录），复制下来的链接与地址栏一致 */
if (isClient) recruit.load(location.search);
watch(
  () => writeQuery(isClient ? location.search : "", state.sel, state.dur),
  (search) => {
    if (search !== location.search)
      history.replaceState(
        history.state,
        "",
        `${location.pathname}${search}${location.hash}`,
      );
  },
);
useEventListener("popstate", () => recruit.load(location.search));

const theme = useHostTheme();

/* 排布看根节点自己的宽度，不看视口（侧栏收起 / 展开都会改变它）：< 760 组合的标签挪到干员上面，< 640 是手机排布 */
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

const { tip, handlers: tipHandlers } = useHoverTip(
  useTemplateRef<HTMLElement>("bubble"),
  ".hr-op[data-tip]",
);
</script>

<template>
  <AkScope class="hr ak-not-prose" :theme="theme" data-no-toggle>
    <AkToastProvider>
      <div
        ref="root"
        :class="[
          'hr-root',
          { 'hr--compact': width < 760, 'hr--narrow': width < 640 },
        ]"
        v-on="tipHandlers"
      >
        <TagPanel />
        <RecruitTips />
        <VerdictBar />
        <div class="hr-legend">
          <span
            ><span class="hr-legend__only">限</span>只能通过公开招募获得</span
          >
          <span data-rarity="4">
            <i />单选这一个标签即可保底（方块颜色 = 保底的稀有度）
          </span>
        </div>
        <ResultView />
      </div>

      <div
        v-if="tip"
        ref="bubble"
        class="ak-tooltip hr-tip"
        role="tooltip"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
      >
        {{ tip.text }}
      </div>
    </AkToastProvider>
  </AkScope>
</template>

<style scoped lang="scss">
@use "./mixins";

// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底
.hr.ak-scope[data-theme] {
  background-color: transparent;
}

.hr-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  margin: 0 0 var(--ak-space-3);
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-muted);

  > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  &__only {
    @include mixins.only-badge;
  }

  i {
    width: 7px;
    height: 7px;
    background: var(--ak-r);
  }
}

// 干员提示：按视口定位，不被格子裁掉
.hr-tip.ak-tooltip {
  position: fixed;
  max-width: min(300px, calc(100vw - 16px));
  white-space: pre-line;
  line-height: 1.55;
  pointer-events: none;
}
</style>
