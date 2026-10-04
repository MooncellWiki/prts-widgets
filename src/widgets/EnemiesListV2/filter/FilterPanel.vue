<script setup lang="ts">
import { computed, useId } from "vue";

import { AkTag } from "@mooncellwiki/prts-design-vue";

import { useEnemyList } from "../store";

import FilterChips from "./FilterChips.vue";
import FilterRow from "./FilterRow.vue";

import type { FilterState } from "../filter";

/**
 * 筛选面板，分两层：
 *   常用（一直在）：地位 · 行动方式 / 种类 / 攻击方式 · 伤害类型——游戏敌人图鉴筛选面板的那五组，选项少的两组并进别的行里；
 *   属性筛选（一枚整行的开关钮，默认收起）：八项属性各一行，选项都是 SS … E，芯片等宽、上下对成列。
 * 不管收起与否，已选条件都在结果栏里列着，属性筛选钮上也有已选数。
 */
const store = useEnemyList();
const { advanced, stats } = store;
const { enemyLevel, motion, enemyRace, attackType, damageType } =
  store.filterById;
const panelId = useId();

/** 常用的三行；选项少的两组（inline）并在别的行后面：小标签 + 芯片 */
const rows: { filter: FilterState; inline?: FilterState; inlineId?: string }[] =
  [
    { filter: enemyLevel, inline: motion, inlineId: useId() },
    { filter: enemyRace },
    { filter: attackType, inline: damageType, inlineId: useId() },
  ];

const statCount = computed(() =>
  stats.reduce((sum, f) => sum + f.selected.size, 0),
);
</script>

<template>
  <section class="el-filter" aria-label="筛选">
    <div class="el-rows">
      <FilterRow v-for="row in rows" :key="row.filter.id" :filter="row.filter">
        <span
          v-if="row.inline"
          :class="['el-inline', { 'has-active': row.inline.selected.size > 0 }]"
          role="group"
          :aria-labelledby="row.inlineId"
        >
          <span :id="row.inlineId" class="el-inline__label">
            {{ row.inline.def.title }}
          </span>
          <FilterChips :filter="row.inline" />
        </span>
      </FilterRow>
    </div>

    <button
      type="button"
      :class="['el-more', { 'has-active': statCount > 0 }]"
      :aria-expanded="advanced.open"
      :aria-controls="panelId"
      @click="advanced.open = !advanced.open"
    >
      <span>属性筛选</span>
      <span class="ak-en">Attributes</span>
      <AkTag v-if="statCount" size="sm" variant="accent-soft">
        已选 {{ statCount }}
      </AkTag>
    </button>
    <div v-show="advanced.open" :id="panelId" class="el-rows el-rows--stats">
      <FilterRow v-for="filter in stats" :key="filter.id" :filter="filter" />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../mixins";

.el-filter {
  margin: 0 0 var(--ak-space-3);
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);
}

// 一组筛选行：标签列随本组最长的标签定宽，各行对齐
.el-rows {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);

  .el--narrow & {
    grid-template-columns: minmax(0, 1fr);
  }

  // 八行的选项相同（SS … E）：芯片等宽，上下对成列
  &--stats {
    border-top: 1px solid var(--ak-border);

    :deep(.ak-chip) {
      min-width: 48px;
      justify-content: center;
      box-sizing: border-box;
      font-family: var(--ak-font-label);
      font-weight: 700;
    }
  }
}

// 一行里并排的第二项：小标签 + 芯片，前面一道竖线
.el-inline {
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

  .el--narrow & {
    margin-left: 0;
    padding-left: 0;
    border-left: 0;
    flex-basis: 100%;
  }
}

// 属性筛选钮：整条是按钮，左缘色条同行标签（里面有已选项时变青）
.el-more {
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
    @include mixins.focus-ring(-2px);
  }

  &.has-active {
    border-left-color: var(--ak-accent);
  }

  .ak-en {
    font-size: 10px;
    color: var(--ak-fg-subtle);
  }

  // 右端的开合记号：收起 ＋ / 展开 −，同 .ak-panel--collapsible、干员一览的「高级筛选」
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
</style>
