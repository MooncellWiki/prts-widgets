<script setup lang="ts">
import { AkChip } from "@mooncellwiki/prts-design-vue";

import MaskIcon from "../../CharList/MaskIcon.vue";
import { branchLine, professionLine } from "../../CharList/assets";

import type {
  FilterOption,
  OperatorFilterDef,
  OperatorFilterId,
  OperatorSelection,
} from "../filters";

/** 一行干员筛选的选项芯片；职业分支按职业分组，稀有度带一颗星。 */
const props = withDefaults(
  defineProps<{
    filter: OperatorFilterDef;
    selection: OperatorSelection;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  toggle: [id: OperatorFilterId, value: string];
}>();

const selected = (option: FilterOption) =>
  props.selection[props.filter.id].includes(option.value);

const toggle = (option: FilterOption) => {
  if (!props.disabled) emit("toggle", props.filter.id, option.value);
};

const chip = (option: FilterOption) => ({
  modelValue: selected(option),
  "aria-disabled": props.disabled || undefined,
  "onUpdate:modelValue": () => toggle(option),
});
</script>

<template>
  <template v-if="filter.id === 'sub' && filter.groups?.length">
    <div
      v-for="group in filter.groups"
      :key="group.label"
      class="ep-branch"
      role="group"
      :aria-label="`${group.label}分支`"
    >
      <span class="ep-branch__prof" :title="group.label" aria-hidden="true">
        <MaskIcon :src="professionLine(group.label)" />
      </span>
      <div class="ep-branch__list">
        <AkChip
          v-for="option in group.options"
          :key="option.value"
          v-bind="chip(option)"
          :class="{ 'is-disabled': disabled }"
        >
          <MaskIcon :src="branchLine(option.label)" />{{ option.label }}
        </AkChip>
      </div>
    </div>
  </template>

  <template v-else-if="filter.id === 'rarity'">
    <!-- 外面包一层拿稀有度色（--ak-r-text），display: contents 不影响排布 -->
    <span
      v-for="option in filter.options"
      :key="option.value"
      class="ep-contents"
      :data-rarity="option.value[0]"
    >
      <AkChip
        v-bind="chip(option)"
        class="ep-chip--rarity"
        :class="{ 'is-disabled': disabled }"
      >
        <i class="ep-star" aria-hidden="true" />{{ option.label }}
      </AkChip>
    </span>
  </template>

  <template v-else-if="filter.id === 'type'">
    <AkChip
      v-for="option in filter.options"
      :key="option.value"
      v-bind="chip(option)"
      :class="{ 'is-disabled': disabled }"
    >
      <MaskIcon :src="professionLine(option.label)" />{{ option.label }}
    </AkChip>
  </template>

  <template v-else>
    <AkChip
      v-for="option in filter.options"
      :key="option.value"
      v-bind="chip(option)"
      :class="{ 'is-disabled': disabled }"
    >
      {{ option.label }}
    </AkChip>
  </template>
</template>

<style scoped lang="scss">
.ep-contents {
  display: contents;
}

.ak-chip {
  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }

  > :deep(.ol-ico) {
    margin-left: -2px;
  }

  // 数据还没回来时仍可显示，只是不响应
  &.is-disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

// 职业分支：一职业一行，行首是职业图标
.ep-branch {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1 1 100%;
  min-width: 0;

  &__prof {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    color: var(--ak-fg-muted);

    :deep(.ol-ico) {
      width: 20px;
      height: 20px;
    }
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }
}

// 稀有度：一颗星 + 数字，星取稀有度色（选中后跟文字）
.ep-star {
  width: 11px;
  height: 11px;
  background: var(--ak-r-text);
  clip-path: polygon(
    50% 0%,
    61% 35%,
    98% 35%,
    68% 57%,
    79% 91%,
    50% 70%,
    21% 91%,
    32% 57%,
    2% 35%,
    39% 35%
  );

  .ak-chip[aria-pressed="true"] & {
    background: currentColor;
  }
}

.ep-chip--rarity {
  gap: 4px;
  font-family: var(--ak-font-label);
  font-weight: 700;
}
</style>
