<script setup lang="ts">
import { computed, useId } from "vue";

import { AkTag } from "@mooncellwiki/prts-design-vue";
import { storeToRefs } from "pinia";

import { useCharListStore } from "../store";

import AdvancedFilter from "./AdvancedFilter.vue";
import FilterChips from "./FilterChips.vue";
import FilterRow from "./FilterRow.vue";
import FilterRows from "./FilterRows.vue";

/**
 * 筛选面板，分两层：
 *   常用（一直在）：职业 / 稀有度 · 位置。分支不平铺——选了职业才出那几个职业的分支（游戏的筛选面板同）；
 *   高级筛选（一枚整行的开关钮，默认收起）：其余各行按「筛什么」归类分页签。
 * 不管收起与否，已选条件都在结果栏里列着，高级筛选钮上也有已选数。
 */
defineProps<{ narrow: boolean }>();

const store = useCharListStore();
const panelId = useId();
const positionId = useId();

const { profession, branch, tabs, advanced } = storeToRefs(store);
const rarity = computed(() => store.byField("rarity"));
const position = computed(() => store.byField("position"));

/** 没选职业却带着分支（旧的短链接可以这样）时整行照出，不然那个条件看不见也取消不了 */
const showBranch = computed(
  () =>
    !!branch.value &&
    (!!profession.value?.sel.size || branch.value.sel.size > 0),
);

const advancedCount = computed(() =>
  tabs.value.reduce(
    (sum, tab) => sum + tab.filters.reduce((n, f) => n + f.sel.size, 0),
    0,
  ),
);
</script>

<template>
  <section class="ol-filter" aria-label="筛选">
    <FilterRows>
      <FilterRow v-if="profession" :filter="profession" />
      <FilterRow v-if="branch && showBranch" :filter="branch" />
      <FilterRow v-if="rarity" :filter="rarity">
        <span
          v-if="position"
          :class="['ol-inline', { 'has-active': position.sel.size > 0 }]"
          role="group"
          :aria-labelledby="positionId"
        >
          <span :id="positionId" class="ol-inline__label">
            {{ position.title }}
          </span>
          <FilterChips :filter="position" />
        </span>
      </FilterRow>
      <FilterRow v-else-if="position" :filter="position" />
    </FilterRows>

    <template v-if="tabs.length > 0">
      <button
        type="button"
        :class="['ol-more', { 'has-active': advancedCount > 0 }]"
        :aria-expanded="advanced.open"
        :aria-controls="panelId"
        @click="advanced.open = !advanced.open"
      >
        <span>高级筛选</span>
        <span class="ak-en">Advanced</span>
        <AkTag v-if="advancedCount" size="sm" variant="accent-soft">
          已选 {{ advancedCount }}
        </AkTag>
      </button>
      <AdvancedFilter v-show="advanced.open" :id="panelId" :narrow="narrow" />
    </template>
  </section>
</template>

<style scoped lang="scss">
.ol-filter {
  margin: 0 0 var(--ak-space-3);
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);
}

// 一行里并排的第二项（稀有度行里的「位置」）：小标签 + 芯片，前面一道竖线
.ol-inline {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  padding-left: 16px;
  border-left: 1px solid var(--ak-border);

  &__label {
    margin-right: 6px;
    font-weight: 600;
    font-size: var(--ak-fs-sm);
    color: var(--ak-fg-secondary);
  }

  &.has-active > &__label {
    color: var(--ak-fg);
  }

  .ol--narrow & {
    margin-left: 0;
    padding-left: 0;
    border-left: 0;
    flex-basis: 100%;
  }
}

// 高级筛选钮：整条是按钮，左缘色条同行标签（里面有已选项时变青）
.ol-more {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 0 var(--ak-space-4) 0 var(--ak-space-3);
  cursor: pointer;
  user-select: none;
  background: var(--ak-bg-surface-2);
  border-top: 1px solid var(--ak-border);
  border-left: var(--ak-bar-w) solid var(--ak-border-strong);
  font-weight: 700;
  font-size: var(--ak-fs-sm);

  &:hover {
    background: var(--ak-bg-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: -2px;
  }

  &.has-active {
    border-left-color: var(--ak-accent);
  }

  .ak-en {
    font-size: 10px;
    color: var(--ak-fg-subtle);
  }

  // 右端的开合箭头
  &::after {
    content: "";
    flex: none;
    width: 7px;
    height: 7px;
    margin: 0 2px 0 auto;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(-45deg);
    opacity: 0.6;
    transition: transform var(--ak-dur-fast);
  }

  &[aria-expanded="true"]::after {
    transform: rotate(45deg);
    margin-top: -3px;
  }
}
</style>
