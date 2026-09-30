<script setup lang="ts">
import { reactive } from "vue";

import { AkSearch, AkTabPane, AkTabs } from "@mooncellwiki/prts-design-vue";

import { useCharListStore } from "../store";

import FilterRow from "./FilterRow.vue";
import FilterRows from "./FilterRows.vue";

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
  filters.reduce((sum, f) => sum + f.selection.selected.size, 0);
const optionCount = (filters: FilterState[]) =>
  filters.reduce((sum, f) => sum + f.def.options.length, 0);
const noneFound = (tab: string, filters: FilterState[]) => {
  const q = needle(tab);
  return (
    !!q &&
    !filters.some((f) =>
      f.def.options.some(
        (option) =>
          f.selection.selected.has(option.id) ||
          option.label.toLowerCase().includes(q),
      ),
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
      <FilterRows>
        <FilterRow
          v-for="f in tab.filters"
          :key="f.id"
          :filter="f"
          :find="needle(tab.id)"
        />
      </FilterRows>
      <p v-if="noneFound(tab.id, tab.filters)" class="ol-adv__none">
        没有叫这个的选项。
      </p>
    </AkTabPane>
  </AkTabs>
</template>

<style scoped lang="scss">
// .ol-adv 是 AkTabs 的根（.ak-tabset）；页签条和页签在组件里面，要用 :deep
.ol-adv {
  gap: 0;
  border-top: 1px solid var(--ak-border);

  &.ak-tabset--left {
    align-items: stretch;
  }

  > :deep(.ak-tabs) {
    .ak-tab:focus-visible {
      outline: 2px solid var(--ak-focus);
      outline-offset: -2px;
    }

    // 页签上的已选数
    .ak-tab small {
      min-width: 16px;
      padding: 2px 4px;
      font-size: 10px;
      text-align: center;
      letter-spacing: 0;
      color: var(--ak-accent-fg);
      background: var(--ak-accent);
    }
  }

  > :deep(.ak-tabs--vertical) {
    border-left: 0;
    border-right: 1px solid var(--ak-border);
    padding: 6px 0;
    gap: 0;
    min-width: 132px;
    background: var(--ak-bg-surface-2);

    .ak-tab {
      margin: 0;
      padding: 8px var(--ak-space-3) 8px
        calc(var(--ak-space-3) - 3px + var(--ak-bar-w) - 1px);
      align-items: center;
      font-family: inherit;
    }
  }

  .ol--narrow & > :deep(.ak-tabs) {
    padding: 0 4px;

    .ak-tab {
      padding: 8px 10px;
    }
  }

  > :deep(.ol-adv__panel) {
    min-width: 0;
    min-height: 168px;
    padding-top: 0;

    &:focus-visible {
      outline-offset: -2px;
    }

    .ol--narrow & {
      min-height: 0;
    }
  }

  // 六维六行的选项相同：芯片等宽，上下对成列
  > :deep(.ol-adv__panel--six) .ak-chip {
    min-width: 64px;
    justify-content: center;
    box-sizing: border-box;
  }
}

.ol-adv__find {
  display: block;
  max-width: 280px;
  margin: 10px var(--ak-space-3) 2px calc(var(--ak-space-3) + var(--ak-bar-w));

  .ol--narrow & {
    max-width: none;
    margin-left: var(--ak-space-3);
  }
}

.ol-adv__none {
  margin: 4px var(--ak-space-3) 10px calc(var(--ak-space-3) + var(--ak-bar-w));
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-muted);
}
</style>
