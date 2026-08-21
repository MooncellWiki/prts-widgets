<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import { NCard, NModal, NText } from "naive-ui";

import LogAllList from "./LogAllList.vue";

import type { LogDocument } from "../engine/log";
import type { RuntimeChoiceSelection } from "../engine/types";

const props = defineProps<{
  show: boolean;
  document: LogDocument;
  activeLineIndex?: number | null;
  selections?: RuntimeChoiceSelection[];
  embedded?: boolean;
}>();
const emit = defineEmits<{ "update:show": [boolean] }>();

const scrollRoot = ref<HTMLElement | null>(null);

// 当正在显示的行变化时，把它滚动进视图（仅弹窗内、非阻塞）。
watch(
  () => props.activeLineIndex,
  async () => {
    await nextTick();
    const root = scrollRoot.value;
    if (!root) return;
    // 同一行号可能在多个分支各出现一次，优先定位到确定在当前路径上的那条
    const el =
      root.querySelector<HTMLElement>('[data-active-line="exact"]') ??
      root.querySelector<HTMLElement>("[data-active-line]");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  },
);
</script>

<template>
  <NCard
    v-if="embedded && show"
    title="LOG ALL"
    closable
    class="h-full"
    content-style="height: calc(100% - 59px); min-height: 0; overflow-y: auto"
    @close="emit('update:show', false)"
  >
    <template #header-extra>
      <span class="text-xs font-normal opacity-60">全部对话文本（含分支）</span>
    </template>

    <NText v-if="document.degraded" depth="3" tag="p" class="m-0 mb-2 text-xs">
      分支组合过多，部分内容未按选择路线区分。
    </NText>

    <div ref="scrollRoot">
      <LogAllList
        :document="document"
        :active-line-index="activeLineIndex"
        :selections="selections"
      />
    </div>
  </NCard>

  <NModal
    v-else-if="!embedded"
    :show="show"
    preset="card"
    title="LOG ALL"
    style="width: min(760px, 94vw); max-width: min(760px, 94vw)"
    :bordered="false"
    :auto-focus="false"
    @update:show="emit('update:show', $event)"
  >
    <template #header-extra>
      <span class="text-xs font-normal opacity-60">全部对话文本（含分支）</span>
    </template>

    <NText v-if="document.degraded" depth="3" tag="p" class="m-0 mb-2 text-xs">
      分支组合过多，部分内容未按选择路线区分。
    </NText>

    <div ref="scrollRoot" class="max-h-[70vh] overflow-y-auto py-1">
      <LogAllList
        :document="document"
        :active-line-index="activeLineIndex"
        :selections="selections"
      />
    </div>
  </NModal>
</template>
