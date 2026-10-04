<script setup lang="ts">
import ListToolbar from "@/components/list/ListToolbar.vue";

import { STAT_COLS, View, type ViewMode } from "./consts";
import { useEnemyList } from "./store";

import type {
  IconName,
  SelectGroupOption,
  SelectOption,
} from "@mooncellwiki/prts-design-vue";

/** 工具条：搜索 · 排序（排序项 + 升降，游戏图鉴的排序也是一枚升降钮）· 显示方式 */
const store = useEnemyList();
const { state } = store;

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
</script>

<template>
  <ListToolbar
    v-model:q="state.q"
    search-placeholder="搜索敌人名称 / 编号 / 能力"
    search-label="搜索敌人名称、图鉴编号或能力"
    :sort-key="state.sort.key"
    :sort-options="SORT_OPTIONS"
    :sort-dir="state.sort.dir"
    :views="VIEWS"
    :view="state.view"
    @update:sort-key="store.setSortKey"
    @flip-sort="store.flipSort()"
    @update:view="store.setView"
  />
</template>
