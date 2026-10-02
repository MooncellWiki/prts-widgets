<script setup lang="ts">
import { useId } from "vue";

import ComboItem from "./ComboItem.vue";

import type { Combo } from "./recruit";

/**
 * 一层：层标题带稀有度色（保底 6★ / 5★ / 4★、必得支援机械、不保底），下面每组一行。
 * collapsible 时层标题是开合钮（「不保底」那一层前面有保底层时默认收起）。
 */
withDefaults(
  defineProps<{
    /** 层标题色块上的星级 */
    rarity: number;
    title: string;
    combos: Combo[];
    /** 层标题右边的小字，默认「N 组」 */
    count?: string;
    /** 保底速查：排成多列的格子 */
    grid?: boolean;
    collapsible?: boolean;
    level?: number;
  }>(),
  { count: undefined, level: 2 },
);

const open = defineModel<boolean>("open", { default: false });
const listId = useId();
</script>

<template>
  <section class="hr-tier" :data-rarity="rarity">
    <button
      v-if="collapsible"
      type="button"
      class="hr-tier__head"
      :aria-expanded="open"
      :aria-controls="listId"
      @click="open = !open"
    >
      <span class="hr-tier__badge">{{ rarity }}<i aria-hidden="true" /></span>
      <span class="hr-tier__title">{{ title }}</span>
      <span class="hr-tier__count">{{ count ?? `${combos.length} 组` }}</span>
    </button>
    <div v-else class="hr-tier__head" role="heading" :aria-level="level">
      <span class="hr-tier__badge">{{ rarity }}<i aria-hidden="true" /></span>
      <span class="hr-tier__title">{{ title }}</span>
      <span class="hr-tier__count">{{ count ?? `${combos.length} 组` }}</span>
    </div>
    <ol
      v-show="!collapsible || open"
      :id="listId"
      :class="['hr-combos', { 'hr-combos--grid': grid }]"
    >
      <ComboItem v-for="c in combos" :key="c.mask" :combo="c" />
    </ol>
  </section>
</template>

<style scoped lang="scss">
@use "./mixins";

.hr-tier {
  margin: 0 0 var(--ak-space-4);

  &__head {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 36px;
    padding: 0 var(--ak-space-3) 0 0;
    background: var(--ak-bg-surface-2);
    border: 1px solid var(--ak-border);
    font-size: var(--ak-fs-sm);
  }

  &__badge {
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    background: var(--ak-r, var(--ak-gray-500));
    color: #1d1f20;
    font: 700 var(--ak-fs-body) / 1 var(--ak-font-label);
    white-space: nowrap;

    i {
      width: 12px;
      height: 12px;
      background: currentColor;
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
    }
  }

  &__title {
    font-weight: 700;
  }

  &__count {
    color: var(--ak-fg-muted);
    font-size: var(--ak-fs-xs);
  }
}

button.hr-tier__head {
  cursor: pointer;

  &:hover {
    background: var(--ak-bg-hover);
  }

  &:focus-visible {
    @include mixins.focus-ring(-2px);
  }

  // 右端的 + / −
  &::after {
    content: "";
    flex: none;
    margin-left: auto;
    width: 10px;
    height: 10px;
    background:
      linear-gradient(currentColor, currentColor) center / 100% 2px no-repeat,
      linear-gradient(currentColor, currentColor) center / 2px 100% no-repeat;
    opacity: 0.6;
  }

  &[aria-expanded="true"]::after {
    background-size:
      100% 2px,
      2px 0;
  }
}

.hr-combos {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--ak-border);
  border-top: 0;
  background: var(--ak-bg-surface);

  &--grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    overflow: hidden;
  }
}
</style>
