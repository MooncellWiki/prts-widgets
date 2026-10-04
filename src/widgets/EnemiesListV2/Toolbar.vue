<script setup lang="ts">
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

import { STAT_COLS, View, type SortKey, type ViewMode } from "./consts";
import { useEnemyList } from "./store";

/** 工具条：搜索 · 排序（排序项 + 升降，游戏图鉴的排序也是一枚升降钮）· 显示方式 */
const store = useEnemyList();
const { state } = store;
const sortId = useId();

const SORT_OPTIONS: (SelectOption | SelectGroupOption)[] = [
  { label: "图鉴顺序", value: "index" },
  { label: "名称", value: "name" },
  {
    type: "group",
    label: "属性",
    children: STAT_COLS.map((col) => ({ label: col.full, value: col.key })),
  },
];
const VIEWS: { view: ViewMode; label: string; icon: IconName }[] = [
  { view: View.TABLE, label: "表格", icon: "table" },
  { view: View.GRID, label: "头像", icon: "grid" },
];

const descending = computed(() => state.sort.dir < 0);
/** AkSelect 给的是 SelectValue，选项都来自 SORT_OPTIONS，就是 SortKey */
const onSortKey = (key: unknown) => store.setSortKey(key as SortKey);
</script>

<template>
  <div class="el-toolbar">
    <AkSearch
      v-model="state.q"
      class="el-toolbar__search"
      placeholder="搜索敌人名称 / 编号 / 能力"
      label="搜索敌人名称、图鉴编号或能力"
      autocomplete="off"
    />
    <div class="el-field el-sort">
      <label :for="sortId">排序</label>
      <AkSelect
        :id="sortId"
        :model-value="state.sort.key"
        :options="SORT_OPTIONS"
        @update:model-value="onSortKey"
      />
      <AkButton
        :label="`排序方向：${descending ? '降序' : '升序'}，点击切换`"
        @click="store.flipSort()"
      >
        {{ descending ? "降序 ↓" : "升序 ↑" }}
      </AkButton>
    </div>
    <AkButtonGroup class="el-view" label="显示方式">
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
.el-toolbar {
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

.el-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
.el-sort {
  gap: 0;

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

.el-view {
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
