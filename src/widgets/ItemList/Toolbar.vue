<script setup lang="ts">
import { computed } from "vue";

import ListToolbar from "@/components/list/ListToolbar.vue";

import { View, type ViewMode } from "./consts";
import { useItemListStore } from "./store";

import type { IconName, SelectOption } from "@mooncellwiki/prts-design-vue";

/** 工具条：搜索 · 排序（排序项 + 升降）· 显示方式 */
const store = useItemListStore();
const { state } = store;

const SORT_OPTIONS: SelectOption[] = [
  { label: "仓库顺序", value: "order" },
  { label: "稀有度", value: "rarity" },
];
const VIEWS: { view: ViewMode; label: string; icon: IconName }[] = [
  { view: View.GRID, label: "图标", icon: "grid" },
  { view: View.LIST, label: "列表", icon: "list" },
];

/** 仓库顺序没有高低，方向写成正序 / 倒序 */
const dirLabels = computed<[string, string]>(() =>
  state.sort.key === "order" ? ["正序", "倒序"] : ["升序", "降序"],
);
</script>

<template>
  <ListToolbar
    v-model:q="state.q"
    search-placeholder="搜索道具名称 / 用途 / 描述"
    search-label="搜索道具名称、用途或描述"
    :sort-key="state.sort.key"
    :sort-options="SORT_OPTIONS"
    :sort-dir="state.sort.dir"
    :dir-labels="dirLabels"
    :views="VIEWS"
    :view="state.view"
    @update:sort-key="store.setSortKey"
    @flip-sort="store.flipSort()"
    @update:view="store.setView"
  />
</template>
