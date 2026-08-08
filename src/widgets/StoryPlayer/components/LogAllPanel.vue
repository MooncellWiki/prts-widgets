<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import { NCard, NModal } from "naive-ui";

import LogAllList from "./LogAllList.vue";

import type { LogAllEntry } from "../engine/logAll";

const props = defineProps<{
  show: boolean;
  entries: LogAllEntry[];
  activeLineIndex?: number | null;
  decisionSelectValue?: number;
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
    const el = root.querySelector<HTMLElement>("[data-active-line]");
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

    <div ref="scrollRoot">
      <LogAllList
        :entries="entries"
        :active-line-index="activeLineIndex"
        :decision-select-value="decisionSelectValue"
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

    <div ref="scrollRoot" class="max-h-[70vh] overflow-y-auto py-1">
      <LogAllList
        :entries="entries"
        :active-line-index="activeLineIndex"
        :decision-select-value="decisionSelectValue"
      />
    </div>
  </NModal>
</template>
