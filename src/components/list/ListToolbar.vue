<script setup lang="ts" generic="K extends string, V extends string | number">
import { computed, useId } from "vue";

import {
  AkButton,
  AkButtonGroup,
  AkSearch,
  AkSelect,
  type IconName,
  type SelectGroupOption,
  type SelectOption,
} from "@mooncellwiki/prts-design-vue";

/**
 * 一览页（干员 / 敌人 / 道具一览）的工具条：搜索 · 排序（排序项 + 升降）· 显示方式。
 * 排序和显示方式之间还要放别的（干员一览的数值加算）走默认插槽。
 */
const props = withDefaults(
  defineProps<{
    searchPlaceholder: string;
    searchLabel: string;
    sortKey: K;
    sortOptions: (SelectOption | SelectGroupOption)[];
    /** 排序方向：1 升 / -1 降 */
    sortDir: number;
    /** 方向钮上的字：[升, 降] */
    dirLabels?: [up: string, down: string];
    views: { view: V; label: string; icon: IconName }[];
    view: V;
  }>(),
  { dirLabels: () => ["升序", "降序"] },
);
const emit = defineEmits<{
  "update:sortKey": [key: K];
  flipSort: [];
  "update:view": [view: V];
}>();
const q = defineModel<string>("q", { required: true });

const sortId = useId();
const dirLabel = computed(() => props.dirLabels[props.sortDir > 0 ? 0 : 1]);
/** AkSelect 给的是 SelectValue，选项都来自 sortOptions，就是 K */
const onSortKey = (key: unknown) => emit("update:sortKey", key as K);
</script>

<template>
  <div class="ls-toolbar">
    <AkSearch
      v-model="q"
      class="ls-toolbar__search"
      :placeholder="searchPlaceholder"
      :label="searchLabel"
      autocomplete="off"
    />
    <div class="ls-field ls-sort">
      <label :for="sortId">排序</label>
      <AkSelect
        :id="sortId"
        :model-value="sortKey"
        :options="sortOptions"
        @update:model-value="onSortKey"
      />
      <AkButton
        :label="`排序方向：${dirLabel}，点击切换`"
        @click="$emit('flipSort')"
      >
        {{ dirLabel }} {{ sortDir > 0 ? "↑" : "↓" }}
      </AkButton>
    </div>
    <slot />
    <AkButtonGroup class="ls-view" label="显示方式">
      <AkButton
        v-for="v in views"
        :key="v.view"
        :icon="v.icon"
        :aria-pressed="view === v.view"
        @click="$emit('update:view', v.view)"
      >
        {{ v.label }}
      </AkButton>
    </AkButtonGroup>
  </div>
</template>

<style scoped lang="scss">
.ls-toolbar {
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

.ls-field {
  display: inline-flex;
  align-items: center;
  font-size: var(--ak-fs-xs);
  font-weight: 600;
  color: var(--ak-fg-muted);
  white-space: nowrap;

  .ak-select {
    width: auto;
    min-height: 36px;
    color: var(--ak-fg);
    font-weight: 400;
  }
}

// 排序项 + 升降：下拉和方向钮贴在一起
.ls-sort {
  > label {
    margin-right: 8px;
  }

  > .ak-btn {
    margin-left: -1px;
    min-width: 76px;
    padding: 0 var(--ak-space-3);
    font-weight: 500;
  }
}

.ls-view {
  .ak-btn {
    gap: 6px;

    &[aria-pressed="true"] {
      --_bg: var(--ak-accent);
      --_fg: var(--ak-accent-fg);
      --_bd: var(--ak-accent);

      z-index: 1;
    }
  }

  :deep(.ak-icon) {
    width: 14px;
    height: 14px;
  }
}
</style>
