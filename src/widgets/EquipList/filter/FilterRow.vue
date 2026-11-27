<script setup lang="ts">
import { useId } from "vue";

/**
 * 一行筛选 / 排序 = 标签列 + 内容。选中后标签左缘出青条、露出「清除」；
 * 排布同干员一览、道具一览的筛选行。
 */
withDefaults(
  defineProps<{
    title: string;
    active?: boolean;
    /** 出「清除」链接；没有可清除的东西时只藏不撤，标签列宽度不跳 */
    clearable?: boolean;
  }>(),
  { active: false, clearable: false },
);

defineEmits<{ clear: [] }>();

defineSlots<{
  /** 选项 / 控件 */
  default?: () => unknown;
}>();

const id = useId();
</script>

<template>
  <div
    :class="['ep-row', { 'has-active': active }]"
    role="group"
    :aria-labelledby="id"
  >
    <div class="ep-row__label">
      <span :id="id">{{ title }}</span>
      <button
        v-if="clearable"
        type="button"
        class="ep-row__clear"
        :aria-label="`清除「${title}」的选择`"
        @click="$emit('clear')"
      >
        清除
      </button>
    </div>
    <div class="ep-row__opts"><slot /></div>
  </div>
</template>

<style scoped lang="scss">
.ep-row {
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
    min-width: 0;
    padding: 8px var(--ak-space-3) 8px 0;
  }

  // 窄排布：标签在上、选项在下
  .ep--narrow & {
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
    &.has-active > .ep-row__opts {
      box-shadow: inset var(--ak-bar-w) 0 0 var(--ak-accent);
    }
  }
}
</style>
