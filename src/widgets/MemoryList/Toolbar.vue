<script setup lang="ts">
import { computed, useId } from "vue";

import {
  AkButton,
  AkSearch,
  AkSelect,
  type SelectOption,
  type SelectValue,
} from "@mooncellwiki/prts-design-vue";

/**
 * 工具条：搜索 · 排序（排序项 + 升降，同其它一览页的一枚方向钮）。
 * 改版前搜索在排序下面单独一行，这里并进工具条，和干员 / 道具一览一致。
 */
const props = withDefaults(
  defineProps<{
    q: string;
    sorting: string;
    order: number;
    disabled?: boolean;
  }>(),
  { disabled: false },
);
const emit = defineEmits<{
  "update:q": [value: string];
  "update:sorting": [value: string];
  "update:order": [value: number];
}>();

const SORT_OPTIONS: SelectOption[] = [
  { label: "干员上线", value: "opt" },
  { label: "首个密录", value: "fmmr" },
  { label: "最新密录", value: "lmmr" },
];
const sortId = useId();
const descending = computed(() => props.order < 0);
const dirLabel = computed(() => (descending.value ? "降序" : "升序"));

function onSort(value: SelectValue | null | undefined) {
  if (value != null) emit("update:sorting", String(value));
}
</script>

<template>
  <div class="ml-toolbar">
    <AkSearch
      :model-value="q"
      class="ml-toolbar__search"
      placeholder="搜索干员名称 / 密录名称 / 引言文字"
      label="搜索干员名称、密录名称或引言文字"
      autocomplete="off"
      @update:model-value="emit('update:q', $event ?? '')"
    />
    <div class="ml-field ml-sort">
      <label :for="sortId">排序</label>
      <AkSelect
        :id="sortId"
        :model-value="sorting"
        :options="SORT_OPTIONS"
        :disabled="disabled"
        @update:model-value="onSort"
      />
      <AkButton
        :disabled="disabled"
        :label="`排序方向：${dirLabel}，点击切换`"
        @click="emit('update:order', -order)"
      >
        {{ dirLabel }} {{ descending ? "↓" : "↑" }}
      </AkButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ml-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin: 0 0 var(--ak-space-3);
  padding: 10px var(--ak-space-3);
  background: var(--ak-bg-surface-2);
  border: 1px solid var(--ak-border);

  &__search {
    flex: 1 1 240px;
    min-width: 0;
  }
}

.ml-field {
  display: inline-flex;
  align-items: center;
  font-size: var(--ak-fs-xs);
  font-weight: 600;
  color: var(--ak-fg-muted);
  white-space: nowrap;

  > label {
    margin-right: 8px;
  }

  .ak-select {
    width: auto;
    min-height: 36px;
    color: var(--ak-fg);
    font-weight: 400;
  }
}

// 排序项 + 升降：下拉和方向钮贴在一起
.ml-sort > .ak-btn {
  margin-left: -1px;
  min-width: 76px;
  padding: 0 var(--ak-space-3);
  font-weight: 500;
}
</style>
