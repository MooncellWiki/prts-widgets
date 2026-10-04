<script setup lang="ts">
import { storeToRefs } from "pinia";

import { useItemListStore } from "../store";

import ItemIcon from "./ItemIcon.vue";

/**
 * 结果 · 图标：一格一件道具（图标 + 名字），整格链到道具页。
 * 用途 / 描述 / 获取途径在悬停、聚焦时的提示里（index.vue 的气泡，data-tip 是道具的次序号）；
 * 触屏上没有悬停，要看这些切到「列表」。
 */
const { pageList } = storeToRefs(useItemListStore());
</script>

<template>
  <div class="il-grid">
    <a
      v-for="item in pageList"
      :key="item.index"
      class="il-cell"
      :href="item.href"
      :data-tip="item.index"
    >
      <ItemIcon :item="item" size="lg" />
      <span class="il-cell__name">{{ item.name }}</span>
    </a>
  </div>
</template>

<style scoped lang="scss">
.il-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--ak-space-1);

  .il--narrow & {
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 2px;
  }
}

.il-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 10px 4px 8px;
  color: var(--ak-fg-secondary);
  text-decoration: none;

  &:hover {
    background: var(--ak-bg-hover);
    color: var(--ak-fg);
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: -2px;
  }

  &__name {
    max-width: 100%;
    font-size: var(--ak-fs-xs);
    line-height: 1.35;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .il--narrow & {
    padding: 8px 2px 6px;

    .ak-item {
      --_s: 64px;
    }
  }
}
</style>
