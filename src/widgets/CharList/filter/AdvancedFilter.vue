<script setup lang="ts">
import { reactive } from "vue";

import { AkSearch, AkTabPane, AkTabs } from "@mooncellwiki/prts-design-vue";

import { useCharListStore } from "../store";

import FilterRow from "./FilterRow.vue";

import type { FilterState } from "../filter";

/**
 * 高级筛选面板：左边竖排页签、右边一次只看一类（手机上页签横排）。
 * 页签上带各自的已选数；选项多的类带一个「找选项」输入框。
 */
defineProps<{
  /** 手机宽度：页签横排在上 */
  narrow: boolean;
}>();

const store = useCharListStore();

/** 各页签「找选项」里输的字 */
const finds = reactive<Record<string, string>>({});
const needle = (tab: string) => (finds[tab] ?? "").trim().toLowerCase();
const selectedCount = (filters: FilterState[]) =>
  filters.reduce((sum, f) => sum + f.sel.size, 0);
const optionCount = (filters: FilterState[]) =>
  filters.reduce((sum, f) => sum + f.labels.length, 0);
const noneFound = (tab: string, filters: FilterState[]) => {
  const q = needle(tab);
  return (
    !!q &&
    !filters.some((f) =>
      f.labels.some((l) => f.sel.has(l) || l.toLowerCase().includes(q)),
    )
  );
};
</script>

<template>
  <AkTabs
    :model-value="store.advanced.tab"
    class="ol-adv"
    :placement="narrow ? 'top' : 'left'"
    label="高级筛选分类"
    @update:model-value="store.advanced.tab = String($event)"
  >
    <AkTabPane
      v-for="tab in store.tabs"
      :key="tab.id"
      :name="tab.id"
      :class="['ol-adv__panel', `ol-adv__panel--${tab.id}`]"
      display-directive="show:lazy"
    >
      <template #tab>
        {{ tab.title }}
        <small v-if="selectedCount(tab.filters)">{{
          selectedCount(tab.filters)
        }}</small>
      </template>
      <AkSearch
        v-if="tab.find"
        v-model="finds[tab.id]"
        class="ol-adv__find"
        size="sm"
        :placeholder="`在 ${optionCount(tab.filters)} 个${tab.title}里找…`"
        :label="`在${tab.title}选项里查找`"
        autocomplete="off"
      />
      <div class="ol-rows">
        <FilterRow
          v-for="f in tab.filters"
          :key="f.field"
          :filter="f"
          :find="needle(tab.id)"
        />
      </div>
      <p v-if="noneFound(tab.id, tab.filters)" class="ol-adv__none">
        没有叫这个的选项。
      </p>
    </AkTabPane>
  </AkTabs>
</template>
