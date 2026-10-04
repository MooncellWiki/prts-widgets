<script setup lang="ts">
import { computed } from "vue";

import {
  AkSwitch,
  type IconName,
  type SelectGroupOption,
  type SelectOption,
} from "@mooncellwiki/prts-design-vue";
import { storeToRefs } from "pinia";

import ListToolbar from "@/components/list/ListToolbar.vue";

import { STAT_COLS, View, type ViewMode } from "./consts";
import { useCharListStore } from "./store";

/** 工具条：搜索 · 排序（排序项 + 升降，同游戏的排序钮一项两个方向）· 数值加算 · 显示方式 */
const store = useCharListStore();
const { state } = store;
const { sortStat } = storeToRefs(store);

const SORT_OPTIONS: (SelectOption | SelectGroupOption)[] = [
  { label: "实装时间", value: "time" },
  { label: "名称", value: "name" },
  { label: "稀有度", value: "rarity" },
  {
    type: "group",
    label: "数值",
    children: STAT_COLS.map((col) => ({ label: col.full, value: col.key })),
  },
];
const VIEWS: { view: ViewMode; label: string; icon: IconName }[] = [
  { view: View.TABLE, label: "表格", icon: "table" },
  { view: View.HALF, label: "半身像", icon: "user" },
  { view: View.AVATAR, label: "头像", icon: "grid" },
];

/** 半身像 / 头像不显示数值，加算开关只在按数值排序时还有用 */
const showAddons = computed(
  () => state.view === View.TABLE || sortStat.value !== null,
);
</script>

<template>
  <ListToolbar
    v-model:q="state.q"
    search-placeholder="搜索干员名称 / 代号 / 特性"
    search-label="搜索干员名称、代号或特性"
    :sort-key="state.sort.key"
    :sort-options="SORT_OPTIONS"
    :sort-dir="state.sort.dir"
    :views="VIEWS"
    :view="state.view"
    @update:sort-key="store.setSortKey"
    @flip-sort="store.flipSort()"
    @update:view="store.setView"
  >
    <div v-if="showAddons" class="ol-addons" role="group" aria-label="数值加算">
      <AkSwitch v-model="state.pot" size="sm">满潜能</AkSwitch>
      <AkSwitch v-model="state.trust" size="sm">满信赖</AkSwitch>
    </div>
  </ListToolbar>
</template>

<style scoped lang="scss">
.ol-addons {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ak-fs-xs);
  white-space: nowrap;

  .ak-switch {
    color: var(--ak-fg);
    font-weight: 500;
  }
}
</style>
