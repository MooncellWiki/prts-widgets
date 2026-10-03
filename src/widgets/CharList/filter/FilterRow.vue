<script setup lang="ts">
import { useId } from "vue";

import { AkSwitch } from "@mooncellwiki/prts-design-vue";

import { useCharListStore } from "../store";

import FilterChips from "./FilterChips.vue";
import ForceTools from "./ForceTools.vue";

import type { FilterState } from "../filter";

/**
 * 一行筛选 = 标签列 + 选项芯片。选中后标签左缘出青条、露出「清除」；
 * 不设「全选」（全选与不选筛出的是同一批）；「同时满足」只有标签行、势力行有，
 * 势力行另有档案 / 作战、隐藏势力，在选项上面的工具条里（ForceTools.vue）。
 */
defineProps<{
  filter: FilterState;
  find?: string;
}>();

defineSlots<{
  /** 选项后面并排的内容（职业行的提示、稀有度行里的「位置」） */
  default?: () => unknown;
}>();

const store = useCharListStore();
const id = useId();
</script>

<template>
  <div
    :class="['ol-row', { 'has-active': filter.selection.selected.size > 0 }]"
    role="group"
    :aria-labelledby="id"
  >
    <div class="ol-row__label">
      <span :id="id">{{ filter.def.title }}</span>
      <AkSwitch
        v-if="filter.def.canAnd"
        :model-value="filter.selection.and"
        size="sm"
        @update:model-value="store.setAnd(filter, $event)"
      >
        同时满足
      </AkSwitch>
      <button
        type="button"
        class="ol-row__clear"
        :aria-label="`清除「${filter.def.title}」的选择`"
        @click="store.clear(filter)"
      >
        清除
      </button>
    </div>
    <div class="ol-row__opts">
      <ForceTools v-if="filter.def.combat" :filter="filter" />
      <FilterChips :filter="filter" :find="find" />
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ol-row {
  display: grid;
  // 不认 subgrid 的浏览器各行自己定宽
  grid-template-columns: max-content minmax(0, 1fr);
  grid-column: 1 / -1;

  @supports (grid-template-columns: subgrid) {
    grid-template-columns: subgrid;
  }

  & + & {
    border-top: 1px solid var(--ak-border);
  }

  &__label {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: start;
    align-items: baseline;
    align-content: start;
    gap: 4px 10px;
    padding: 12px var(--ak-space-4) 8px var(--ak-space-3);
    border-left: var(--ak-bar-w) solid transparent;
    font-weight: 600;
    font-size: var(--ak-fs-sm);
    line-height: 1.4;
    color: var(--ak-fg-secondary);
    white-space: nowrap;

    // 「同时满足」另起一行
    .ak-switch {
      order: 1;
      grid-column: 1 / -1;
      font-weight: 500;
      color: var(--ak-fg-secondary);
    }
  }

  &.has-active > &__label {
    border-left-color: var(--ak-accent);
    color: var(--ak-fg);
  }

  &__clear {
    all: unset;
    font-size: var(--ak-fs-xs);
    font-weight: 500;
    color: var(--ak-link);
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid var(--ak-focus);
      outline-offset: 2px;
    }
  }

  // 「清除」横在标签右边；没选中时只藏不撤，标签列的宽度不随选中跳动
  &:not(.has-active) &__clear {
    visibility: hidden;
  }

  &__opts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px var(--ak-space-3) 8px 0;
    min-width: 0;
  }

  // 窄排布：标签在上、选项在下
  .ol--narrow & {
    grid-template-columns: minmax(0, 1fr);

    &__label {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
      padding: 8px var(--ak-space-3) 0 8px;
      white-space: normal;

      .ak-switch {
        order: 0;
      }
    }

    &__opts {
      padding: 8px var(--ak-space-3) 10px calc(8px + var(--ak-bar-w));
    }

    // 青条接着往下画满一行
    &.has-active > .ol-row__opts {
      box-shadow: inset var(--ak-bar-w) 0 0 var(--ak-accent);
    }
  }
}
</style>
