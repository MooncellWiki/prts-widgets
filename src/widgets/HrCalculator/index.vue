<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref, useTemplateRef } from "vue";

import { AkScope, AkToastProvider } from "@mooncellwiki/prts-design-vue";
import { isClient } from "@vueuse/core";

import { useHostTheme } from "@/utils/useHostTheme";
import { useHoverTip } from "@/utils/useHoverTip";

import ResultView from "./ResultView.vue";
import TagPanel from "./TagPanel.vue";
import VerdictBar from "./VerdictBar.vue";
import { createRecruit, recruitKey } from "./store";

import type { Source } from "./recruit";

/**
 * 公招计算（PRTS Design 视觉，对应设计稿 /patterns/recruit）：
 * 标签面板 → 图例与工具栏 → 按「保底几星」分层的组合（每组至多 3 个标签，不保底的那层默认收起）；一个标签都没选时，结果区是保底速查。
 * 不按招募时限筛干员，保底按 9:00 算（见 consts.ts 的 MIN_STAR）。
 * .ak-* 是设计系统组件（样式来自皮肤 / skins.arknights.components），.hr-* 是这页自己的排布（各组件的 scoped 样式）。
 * 根节点标 ak-not-prose，不吃皮肤的正文排版；data-no-toggle 让皮肤脚本别替模板芯片翻状态。
 */
const props = withDefaults(
  defineProps<{
    source?: Source[];
    /** 干员数据没取到：结果区出失败提示，不再转圈 */
    failed?: boolean;
  }>(),
  { source: () => [] },
);

const recruit = createRecruit(props.source);
provide(recruitKey, recruit);

/* 地址栏：?filter= 同旧版，只在打开时读一次、不往回写——刷新页面就是清空（旧版的用法）；分享走工具栏的「复制分享链接」 */
if (isClient) recruit.load(location.search);

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
        <VerdictBar />
        <ResultView :failed="failed" />
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
// 别的皮肤上根节点带 data-theme（见 useHostTheme），设计系统会连画布底色一起铺；这里嵌在宿主正文里，不要那块底
.hr.ak-scope[data-theme] {
  background-color: transparent;
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
