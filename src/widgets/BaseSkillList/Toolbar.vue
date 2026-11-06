<script setup lang="ts">
import { computed } from "vue";

import ListToolbar from "@/components/list/ListToolbar.vue";

import { OP_SORT_KEYS, type SortKey, View, type ViewMode } from "./consts";
import { useBaseSkillList } from "./store";

import type { IconName, SelectOption } from "@mooncellwiki/prts-design-vue";

/** 工具条：搜索 · 排序（排序项 + 升降）· 显示方式（技能 / 干员） */
const store = useBaseSkillList();
const { state } = store;

const SORTS: { label: string; value: SortKey }[] = [
  { label: "游戏顺序", value: "order" },
  { label: "效率", value: "eff" },
  { label: "持有人数", value: "holders" },
  { label: "技能名", value: "name" },
];
/** 干员视图里效率 / 持有人数没有意义，只剩游戏顺序与名称 */
const sortOptions = computed<SelectOption[]>(() =>
  state.view === View.OP
    ? SORTS.filter((s) => OP_SORT_KEYS.includes(s.value)).map((s) =>
        s.value === "name" ? { ...s, label: "名称" } : s,
      )
    : SORTS,
);
/** 方向钮上的字随排序项：游戏顺序是正序 / 倒序，名称是升序 / 降序，数值是从低到高 / 从高到低 */
const dirLabels = computed<[string, string]>(() => {
  const { key } = state.sort;
  if (key === "order") return ["正序", "倒序"];
  if (key === "name") return ["升序", "降序"];
  return ["从低到高", "从高到低"];
});
const VIEWS: { view: ViewMode; label: string; icon: IconName }[] = [
  { view: View.SKILL, label: "技能", icon: "list" },
  { view: View.OP, label: "干员", icon: "grid" },
];
</script>

<template>
  <ListToolbar
    v-model:q="state.q"
    search-placeholder="搜索技能名 / 描述 / 干员名"
    search-label="搜索技能名、描述或持有干员"
    :sort-key="state.sort.key"
    :sort-options="sortOptions"
    :sort-dir="state.sort.dir"
    :dir-labels="dirLabels"
    :views="VIEWS"
    :view="state.view"
    @update:sort-key="store.setSortKey"
    @flip-sort="store.flipSort()"
    @update:view="store.setView"
  />
</template>
