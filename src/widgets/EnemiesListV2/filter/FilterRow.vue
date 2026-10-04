<script setup lang="ts">
import { useId } from "vue";

import { useEnemyList } from "../store";

import FilterChips from "./FilterChips.vue";

import type { FilterState } from "../filter";

/**
 * 一行筛选 = 标签列 + 选项芯片。选中后标签左缘出青条、露出「清除」；
 * 不设「全选」（全选与不选筛出的是同一批）。
 */
defineProps<{ filter: FilterState }>();

defineSlots<{
  /** 选项后面并排的内容（地位行里的「行动方式」、攻击方式行里的「伤害类型」） */
  default?: () => unknown;
}>();

const store = useEnemyList();
const id = useId();
</script>

<template>
  <div
    :class="['el-row', { 'has-active': filter.selected.size > 0 }]"
    role="group"
    :aria-labelledby="id"
  >
    <div class="el-row__label">
      <span :id="id">{{ filter.def.title }}</span>
      <button
        type="button"
        class="el-row__clear"
        :aria-label="`清除「${filter.def.title}」的选择`"
        @click="store.clear(filter)"
      >
        清除
      </button>
    </div>
    <div class="el-row__opts">
      <FilterChips :filter="filter" />
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../mixins";

.el-row {
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
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 12px var(--ak-space-4) 8px var(--ak-space-3);
    border-left: var(--ak-bar-w) solid transparent;
    font-weight: 600;
    font-size: var(--ak-fs-sm);
    line-height: 1.4;
    color: var(--ak-fg-secondary);
    white-space: nowrap;
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
      @include mixins.focus-ring;
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
  .el--narrow & {
    grid-template-columns: minmax(0, 1fr);

    &__label {
      align-items: center;
      gap: 4px 12px;
      padding: 8px var(--ak-space-3) 0 8px;
      white-space: normal;
    }

    &__opts {
      padding: 8px var(--ak-space-3) 10px calc(8px + var(--ak-bar-w));
    }

    // 青条接着往下画满一行
    &.has-active > .el-row__opts {
      box-shadow: inset var(--ak-bar-w) 0 0 var(--ak-accent);
    }
  }
}
</style>
