<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

import { AkButton, AkMessage, AkPanel } from "@mooncellwiki/prts-design-vue";

import LogAllList from "./LogAllList.vue";

import type { LogDocument } from "../engine/log";
import type { RuntimeChoiceSelection } from "../engine/types";

const props = defineProps<{
  document: LogDocument;
  activeLineIndex?: number | null;
  selections?: RuntimeChoiceSelection[];
  seekable?: boolean;
  seekError?: string | null;
}>();
const emit = defineEmits<{
  close: [];
  seek: [lineIndex: number, audience: number];
}>();

const scrollRoot = ref<HTMLElement | null>(null);

function scrollToActiveLine(): void {
  const root = scrollRoot.value;
  if (!root) return;
  // 同一行可能出现在多个分支，优先定位已选路径里的那一条。
  const line =
    root.querySelector<HTMLElement>('[data-active-line="exact"]') ??
    root.querySelector<HTMLElement>("[data-active-line]");
  if (!line) return;

  // 只滚动阅读区，避免拖动 Wiki 宿主页面。
  root.scrollTop +=
    line.getBoundingClientRect().top -
    root.getBoundingClientRect().top -
    (root.clientHeight - line.offsetHeight) / 2;
}

onMounted(() => {
  scrollRoot.value?.focus({ preventScroll: true });
  scrollToActiveLine();
});
watch(
  [() => props.activeLineIndex, () => props.selections],
  scrollToActiveLine,
  {
    flush: "post",
  },
);
</script>

<template>
  <AkPanel
    class="log-all-panel"
    title="剧情全文"
    title-tag="h2"
    en="LOG ALL"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <template #header-extra>
      <span v-if="seekable" class="log-all-seek-hint">点击文本行快进</span>
      <AkButton
        icon="x"
        label="关闭剧情全文"
        size="sm"
        variant="ghost"
        @click="emit('close')"
      />
    </template>
    <AkMessage v-if="seekError" class="log-all-seek-error" variant="warning">
      {{ seekError }}
    </AkMessage>
    <div
      ref="scrollRoot"
      class="log-all-scroll"
      role="region"
      aria-label="剧情文本内容"
      tabindex="0"
    >
      <div class="log-all-reading">
        <AkMessage
          v-if="document.degraded"
          class="log-all-notice"
          variant="warning"
        >
          分支组合过多，部分内容未按选择路线区分。
        </AkMessage>
        <LogAllList
          :document="document"
          :active-line-index="activeLineIndex"
          :selections="selections"
          :seekable="seekable"
          @seek="(lineIndex, audience) => emit('seek', lineIndex, audience)"
        />
      </div>
    </div>
  </AkPanel>
</template>

<style scoped>
.log-all-panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  margin: 0;
}

.log-all-panel :deep(.ak-panel__head) {
  min-height: 48px;
}

.log-all-panel :deep(.ak-panel__title) {
  font-family: var(--ak-font-body);
}

.log-all-panel :deep(.ak-panel__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 0;
}

.log-all-scroll {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  overscroll-behavior-y: contain;
}

.log-all-scroll:focus-visible {
  outline-offset: -3px;
}

.log-all-reading {
  max-width: 56rem;
  margin-inline: auto;
  padding: var(--ak-space-3) clamp(var(--ak-space-2), 2vw, var(--ak-space-6));
}

.log-all-notice {
  margin-bottom: var(--ak-space-3);
}

.log-all-seek-hint {
  color: var(--ak-fg-muted);
  font-size: var(--ak-fs-xs);
  text-align: end;
}

.log-all-seek-error {
  margin: var(--ak-space-3);
}
</style>
