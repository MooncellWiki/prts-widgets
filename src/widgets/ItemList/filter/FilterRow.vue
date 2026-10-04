<script setup lang="ts">
import { computed, useId } from "vue";

import { AkChip } from "@mooncellwiki/prts-design-vue";

import { useItemListStore } from "../store";

import type { FilterDef, FilterOption } from "../filters";

/**
 * 一行筛选 = 标签列 + 选项芯片（排布同干员一览的筛选行）。选中后标签左缘出青条、露出「清除」；
 * 不设「全选」（全选与不选筛出的是同一批）。选项分了组的（分类）一组一行，行首是组名。
 */
const props = defineProps<{ filter: FilterDef }>();

const store = useItemListStore();
const id = useId();

const selected = computed(() => store.state.selection[props.filter.id]);
const chip = (option: FilterOption) => ({
  modelValue: selected.value.has(option.id),
  class: { "is-empty": store.empties[props.filter.id].has(option.id) },
  "onUpdate:modelValue": () => store.toggle(props.filter.id, option.id),
});
</script>

<template>
  <div
    :class="['il-row', { 'has-active': selected.size > 0 }]"
    role="group"
    :aria-labelledby="id"
  >
    <div class="il-row__label">
      <span :id="id">{{ filter.title }}</span>
      <button
        type="button"
        class="il-row__clear"
        :aria-label="`清除「${filter.title}」的选择`"
        @click="store.clear(filter.id)"
      >
        清除
      </button>
    </div>
    <div class="il-row__opts">
      <template v-if="filter.groups">
        <div
          v-for="group in filter.groups"
          :key="group.label"
          class="il-group"
          role="group"
          :aria-label="group.label"
        >
          <span class="il-group__label" aria-hidden="true">
            {{ group.label }}
          </span>
          <div class="il-group__list">
            <AkChip
              v-for="option in group.options"
              :key="option.id"
              v-bind="chip(option)"
            >
              {{ option.label }}
            </AkChip>
          </div>
        </div>
      </template>
      <template v-else-if="filter.id === 'rarity'">
        <!-- 外面包一层拿稀有度色（--ak-r-text），display: contents 不影响排布 -->
        <span
          v-for="option in filter.options"
          :key="option.id"
          class="il-contents"
          :data-rarity="Number(option.id) + 1"
        >
          <AkChip v-bind="chip(option)">
            <i class="il-ring" aria-hidden="true" />{{ option.label }}
          </AkChip>
        </span>
      </template>
      <template v-else>
        <AkChip
          v-for="option in filter.options"
          :key="option.id"
          v-bind="chip(option)"
        >
          {{ option.label }}
        </AkChip>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.il-row {
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
    align-content: start;
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
      outline: 2px solid var(--ak-focus);
      outline-offset: 2px;
    }
  }

  // 没选中时只藏不撤，标签列的宽度不随选中跳动
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
  .il--narrow & {
    grid-template-columns: minmax(0, 1fr);

    &__label {
      align-items: center;
      padding: 8px var(--ak-space-3) 0 8px;
    }

    &__opts {
      padding: 8px var(--ak-space-3) 10px calc(8px + var(--ak-bar-w));
    }

    // 青条接着往下画满一行
    &.has-active > .il-row__opts {
      box-shadow: inset var(--ak-bar-w) 0 0 var(--ak-accent);
    }
  }
}

.il-contents {
  display: contents;
}

.ak-chip {
  // 点了也不会多出道具的选项压淡，仍可点
  &.is-empty:not([aria-pressed="true"]) {
    opacity: 0.38;
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }
}

// 分类：一组一行，行首是组名
.il-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1 1 100%;
  min-width: 0;

  &__label {
    flex: none;
    width: 4em;
    font-size: var(--ak-fs-xs);
    line-height: 28px;
    color: var(--ak-fg-muted);
    white-space: nowrap;
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }

  // 窄排布：组名单独一行
  .il--narrow & {
    flex-direction: column;
    gap: 2px;

    &__label {
      width: auto;
      line-height: 1.6;
    }
  }
}

// 稀有度：一枚道具底框那样的圆环，取稀有度色（选中后跟文字）
.il-ring {
  box-sizing: border-box;
  width: 12px;
  height: 12px;
  margin-left: -2px;
  border: 3px solid var(--ak-r-text);
  border-radius: 50%;

  .ak-chip[aria-pressed="true"] & {
    border-color: currentColor;
  }
}
</style>
