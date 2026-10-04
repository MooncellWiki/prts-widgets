<script setup lang="ts">
import { computed, useId } from "vue";

import {
  AkButton,
  AkButtonGroup,
  AkSearch,
  AkSelect,
  type IconName,
  type SelectOption,
} from "@mooncellwiki/prts-design-vue";

import { View, type SortKey, type ViewMode } from "./consts";
import { useItemListStore } from "./store";

/** 工具条：搜索 · 排序（排序项 + 升降）· 显示方式 */
const store = useItemListStore();
const { state } = store;
const sortId = useId();

const SORT_OPTIONS: SelectOption[] = [
  { label: "仓库顺序", value: "order" },
  { label: "稀有度", value: "rarity" },
];
const VIEWS: { view: ViewMode; label: string; icon: IconName }[] = [
  { view: View.GRID, label: "图标", icon: "grid" },
  { view: View.LIST, label: "列表", icon: "list" },
];

/** 仓库顺序没有高低，方向写成正序 / 倒序 */
const dirLabel = computed(() => {
  const up = state.sort.dir > 0;
  if (state.sort.key === "order") return up ? "正序" : "倒序";
  return up ? "升序" : "降序";
});
/** AkSelect 给的是 SelectValue，选项都来自 SORT_OPTIONS，就是 SortKey */
const onSortKey = (key: unknown) => store.setSortKey(key as SortKey);
</script>

<template>
  <div class="il-toolbar">
    <AkSearch
      v-model="state.q"
      class="il-toolbar__search"
      placeholder="搜索道具名称 / 用途 / 描述"
      label="搜索道具名称、用途或描述"
      autocomplete="off"
    />
    <div class="il-field il-sort">
      <label :for="sortId">排序</label>
      <AkSelect
        :id="sortId"
        :model-value="state.sort.key"
        :options="SORT_OPTIONS"
        @update:model-value="onSortKey"
      />
      <AkButton
        :label="`排序方向：${dirLabel}，点击切换`"
        @click="store.flipSort()"
      >
        {{ dirLabel }} {{ state.sort.dir > 0 ? "↑" : "↓" }}
      </AkButton>
    </div>
    <AkButtonGroup class="il-view" label="显示方式">
      <AkButton
        v-for="v in VIEWS"
        :key="v.view"
        :icon="v.icon"
        :aria-pressed="state.view === v.view"
        @click="store.setView(v.view)"
      >
        {{ v.label }}
      </AkButton>
    </AkButtonGroup>
  </div>
</template>

<style scoped lang="scss">
.il-toolbar {
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

.il-field {
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
.il-sort {
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

.il-view {
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
