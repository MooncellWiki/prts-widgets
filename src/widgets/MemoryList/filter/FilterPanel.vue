<script setup lang="ts">
import { computed, useId } from "vue";

import { AkChip } from "@mooncellwiki/prts-design-vue";

/**
 * 稀有度筛选：一行 = 标签列 + 选项芯片（排布同干员一览 / 道具一览的筛选行）。
 * 选中后标签左缘出青条、露出「清除」；不设「全选」（全选与不选筛出的是同一批）。
 */
const props = withDefaults(
  defineProps<{
    title: string;
    options: string[];
    modelValue?: string[];
  }>(),
  { modelValue: () => [] },
);
const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

const id = useId();
const selected = computed(() => new Set(props.modelValue));
/** 选项形如「1★」…「6★」；拆出数字给稀有度色（--ak-r-text）用 */
const items = computed(() =>
  props.options.map((option) => ({
    option,
    rarity: Number.parseInt(option, 10),
  })),
);

function toggle(option: string) {
  const next = props.modelValue.slice();
  const index = next.indexOf(option);
  if (index === -1) next.push(option);
  else next.splice(index, 1);
  emit("update:modelValue", next);
}

function clear() {
  emit("update:modelValue", []);
}
</script>

<template>
  <section class="ml-filter" aria-label="筛选">
    <div
      :class="['ml-row', { 'has-active': modelValue.length > 0 }]"
      role="group"
      :aria-labelledby="id"
    >
      <div class="ml-row__label">
        <span :id="id">{{ title }}</span>
        <button
          type="button"
          class="ml-row__clear"
          :aria-label="`清除「${title}」的选择`"
          @click="clear"
        >
          清除
        </button>
      </div>
      <div class="ml-row__opts">
        <!-- 星星画法同干员一览的稀有度芯片：CSS 星取稀有度色，选中后跟文字色 -->
        <span
          v-for="item in items"
          :key="item.option"
          class="ml-contents"
          :data-rarity="item.rarity"
        >
          <AkChip
            :model-value="selected.has(item.option)"
            class="ml-chip--rarity"
            @update:model-value="toggle(item.option)"
          >
            <i class="ml-star" aria-hidden="true" />{{ item.rarity
            }}<span class="ak-sr-only">星</span>
          </AkChip>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.ml-filter {
  margin: 0 0 var(--ak-space-3);
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);
}

.ml-row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);

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
    padding: 8px var(--ak-space-3) 8px 0;
    min-width: 0;

    :deep(.ak-chip) {
      font-family: var(--ak-font-label);
      font-weight: 700;
    }
  }

  // 窄排布：标签在上、选项在下
  @media (max-width: 639px) {
    grid-template-columns: minmax(0, 1fr);

    &__label {
      padding: 8px var(--ak-space-3) 0 8px;
    }

    &__opts {
      padding: 8px var(--ak-space-3) 10px calc(8px + var(--ak-bar-w));
    }

    // 青条接着往下画满一行
    &.has-active > .ml-row__opts {
      box-shadow: inset var(--ak-bar-w) 0 0 var(--ak-accent);
    }
  }
}

// 外面包一层拿稀有度色（--ak-r-text），display: contents 不影响排布
.ml-contents {
  display: contents;
}

.ml-chip--rarity {
  gap: 4px;
}

// 同干员一览的稀有度星：CSS 裁出五角星，未选中取稀有度色，选中后跟文字色
.ml-star {
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
</style>
