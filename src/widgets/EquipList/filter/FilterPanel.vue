<script setup lang="ts">
import { computed, useId } from "vue";

import { AkTag } from "@mooncellwiki/prts-design-vue";

import FilterChips from "./FilterChips.vue";
import FilterRow from "./FilterRow.vue";

import type {
  OperatorFilterDef,
  OperatorFilterId,
  OperatorSelection,
} from "../filters";

/**
 * 干员筛选面板：常用行（职业 / 稀有度；选了职业才出职业分支）+ 高级筛选栏（模组筛选）。
 * 排布同干员一览：行标签在左、选项芯片在右；高级筛选钮是一整条按钮，有已选条件时左缘变青。
 */
const props = withDefaults(
  defineProps<{
    filters: OperatorFilterDef[];
    selection: OperatorSelection;
    /** 高级筛选里已生效的条件数 */
    advancedCount?: number;
    disabled?: boolean;
  }>(),
  { advancedCount: 0, disabled: false },
);

const emit = defineEmits<{
  toggle: [id: OperatorFilterId, value: string];
  clear: [id: OperatorFilterId];
}>();

const advancedOpen = defineModel<boolean>("advancedOpen", { default: false });
const advancedId = useId();

const FILTER_ORDER: Record<string, number> = { type: 0, sub: 1, rarity: 2 };

const visibleFilters = computed(() =>
  [...props.filters]
    .filter(
      (filter) =>
        filter.id !== "sub" ||
        props.selection.type.length > 0 ||
        props.selection.sub.length > 0,
    )
    .sort((a, b) => (FILTER_ORDER[a.id] ?? 99) - (FILTER_ORDER[b.id] ?? 99)),
);

const onToggle = (id: OperatorFilterId, value: string) =>
  emit("toggle", id, value);
</script>

<template>
  <section class="ep-filter" aria-label="筛选">
    <div class="ep-rows">
      <FilterRow
        v-for="filter in visibleFilters"
        :key="filter.id"
        :title="filter.title"
        :active="selection[filter.id].length > 0"
        clearable
        @clear="emit('clear', filter.id)"
      >
        <FilterChips
          :filter="filter"
          :selection="selection"
          :disabled="disabled"
          @toggle="onToggle"
        />
      </FilterRow>
    </div>

    <button
      type="button"
      :class="['ep-more', { 'has-active': advancedCount > 0 }]"
      :aria-expanded="advancedOpen"
      :aria-controls="advancedId"
      @click="advancedOpen = !advancedOpen"
    >
      <span>高级筛选</span>
      <AkTag v-if="advancedCount" size="sm" variant="accent-soft">
        已选 {{ advancedCount }}
      </AkTag>
    </button>
    <div v-show="advancedOpen" :id="advancedId" class="ep-advanced">
      <slot name="advanced" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.ep-filter {
  margin: 0 0 var(--ak-space-3);
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);
}

.ep-rows {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);

  .ep--narrow & {
    grid-template-columns: minmax(0, 1fr);
  }
}

.ep-more {
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

  &::after {
    content: "";
    flex: none;
    width: 10px;
    height: 10px;
    margin-left: auto;
    background:
      linear-gradient(currentColor, currentColor) center / 100% 2px no-repeat,
      linear-gradient(currentColor, currentColor) center / 2px 100% no-repeat;
    opacity: 0.6;
    transition: background-size var(--ak-dur-fast);
  }

  &[aria-expanded="true"]::after {
    background-size:
      100% 2px,
      2px 0;
  }
}

.ep-advanced {
  border-top: 1px solid var(--ak-border);
}
</style>
