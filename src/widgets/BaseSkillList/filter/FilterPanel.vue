<script setup lang="ts">
import { computed, ref, useId } from "vue";

import { AkTag } from "@mooncellwiki/prts-design-vue";

import { useBaseSkillList } from "../store";

import FilterRow from "./FilterRow.vue";

/**
 * 筛选面板，五行（现网没有筛选，10 个设施是 10 章折叠表）：
 *   设施（设施页里没有这一行）/ 作用对象（选了制造站 / 加工站 / 训练室才出，同干员一览「分支」行只在选了职业时出）/
 *   解锁阶段 / 干员稀有度 / 干员职业。
 * 窄排布（手机）上默认收成一枚「筛选」钮（钮上有已选数），点开才出；不管收起与否，已选条件都在结果栏里列着。
 */
defineProps<{ narrow: boolean }>();

const store = useBaseSkillList();
const { rows, targetRooms } = store;
const rowsId = useId();
const open = ref(false);

const shownRows = computed(() =>
  rows.filter(
    (f) =>
      (f.id !== "room" || !store.room) &&
      (f.id !== "target" || targetRooms.value.length > 0),
  ),
);
const activeCount = computed(() =>
  rows.reduce((n, f) => n + f.selected.size, 0),
);
</script>

<template>
  <section class="rs-filter" aria-label="筛选">
    <button
      v-if="narrow"
      type="button"
      :class="['rs-more', { 'has-active': activeCount > 0 }]"
      :aria-expanded="open"
      :aria-controls="rowsId"
      @click="open = !open"
    >
      <span>筛选</span>
      <span class="ak-en">Filter</span>
      <AkTag v-if="activeCount" size="sm" variant="accent-soft">
        已选 {{ activeCount }}
      </AkTag>
    </button>
    <div v-show="!narrow || open" :id="rowsId" class="rs-rows">
      <FilterRow
        v-for="f in shownRows"
        :key="f.id"
        :filter="f"
        :groups="f.id === 'target' ? targetRooms : undefined"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.rs-filter {
  margin: 0 0 var(--ak-space-3);
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);
}

// 标签列随最长的标签定宽，各行对齐
.rs-rows {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);

  .rs--narrow & {
    grid-template-columns: minmax(0, 1fr);
    border-top: 1px solid var(--ak-border);
  }
}

// 「筛选」钮（只在窄排布出）：整条是按钮，左缘色条同行标签（有已选项时变青），同道具一览
.rs-more {
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

  // 右端的开合记号：收起 ＋ / 展开 −，同 .ak-panel--collapsible
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
