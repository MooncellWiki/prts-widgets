<script setup lang="ts">
import { computed } from "vue";

import {
  AkSwitch,
  AkTab,
  AkTabs,
  type SelectOption,
} from "@mooncellwiki/prts-design-vue";

import ListToolbar from "@/components/list/ListToolbar.vue";

import { useExplorer, type SortKey, type ViewMode } from "../store";
import { CHARACTER_CATEGORIES, type CharacterCategory } from "../utils";

/**
 * 工具条：搜索 · 排序（资源名 / 剧本数 + 升降）· 显示方式（大图 / 小图）；
 * 角色页签多一行：分类（干员 / NPC / 其他）与「按角色合并」。
 */
const store = useExplorer();
const { state, categoryCounts } = store;

const SORT_OPTIONS: SelectOption[] = [
  { label: "资源名", value: "id" },
  { label: "剧本数", value: "count" },
];
const VIEWS: { view: ViewMode; label: string }[] = [
  { view: "card", label: "大图" },
  { view: "wall", label: "小图" },
];

const allCount = computed(
  () =>
    categoryCounts.value.operator +
    categoryCounts.value.npc +
    categoryCounts.value.other,
);

const category = computed({
  get: () => state.cat,
  set: (value: CharacterCategory | "") => {
    state.cat = value;
  },
});
</script>

<template>
  <ListToolbar
    v-model:q="state.q"
    class="sae-toolbar"
    search-placeholder='搜索资源名，也可粘贴剧本里的 name="…" 或 wiki 文件名'
    search-label="搜索资源名"
    :sort-key="state.sort.key"
    :sort-options="SORT_OPTIONS"
    :sort-dir="state.sort.dir"
    :views="VIEWS"
    :view="state.view"
    @update:sort-key="store.setSortKey($event as SortKey)"
    @flip-sort="store.flipSort()"
    @update:view="store.setView"
  >
    <div v-if="state.type === 'character'" class="sae-subrow">
      <AkTabs v-model="category" variant="pill" label="角色分类">
        <AkTab name=""
          >全部<small>{{ allCount }}</small></AkTab
        >
        <AkTab
          v-for="option in CHARACTER_CATEGORIES"
          :key="option.value"
          :name="option.value"
        >
          {{ option.label }}<small>{{ categoryCounts[option.value] }}</small>
        </AkTab>
      </AkTabs>
      <AkSwitch v-model="state.merge" size="sm" class="sae-subrow__merge">
        同一角色只显示一张
      </AkSwitch>
    </div>
  </ListToolbar>
</template>

<style scoped lang="scss">
// 角色的分类一行：排在工具条最后、独占一行（ListToolbar 的插槽在排序和显示方式之间，用 order 挪到末尾）
.sae-subrow {
  order: 1;
  flex: 1 0 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding-top: 10px;
  border-top: 1px solid var(--ak-border);

  :deep(.ak-tabs) {
    max-width: 100%;
    overflow-x: auto;
  }

  :deep(.ak-tab small) {
    font-variant-numeric: tabular-nums;
  }

  &__merge {
    margin-left: auto;
    font-size: var(--ak-fs-sm);

    .sae--narrow & {
      margin-left: 0;
    }
  }
}
</style>
