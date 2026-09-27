<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { wikiImage, wikiLink } from "../utils";

// 对应 模板:道具图标
const props = withDefaults(
  defineProps<{
    name: string;
    size?: number;
    /** 右下角数量角标 */
    count?: number | string;
    link?: boolean;
  }>(),
  { size: 50, link: true },
);

const failed = ref(false);
watch(
  () => props.name,
  () => (failed.value = false),
);
const src = computed(() =>
  wikiImage(failed.value ? "无图片占位符.png" : `道具_带框_${props.name}.png`),
);
</script>

<template>
  <span class="item-icon" :style="{ width: `${size}px`, height: `${size}px` }">
    <component
      :is="link ? 'a' : 'span'"
      :href="link ? wikiLink(name) : undefined"
    >
      <img
        :src="src"
        :alt="name"
        :title="name"
        :width="size"
        :height="size"
        loading="lazy"
        @error="failed = true"
      />
    </component>
    <span v-if="count !== undefined || $slots.default" class="item-icon-count">
      <slot>{{ count }}</slot>
    </span>
  </span>
</template>

<style scoped>
.item-icon {
  position: relative;
  display: inline-block;
  line-height: 0;
  vertical-align: middle;
}

/* 同 模板:物品数量角标/styles.css */
.item-icon-count {
  position: absolute;
  right: 2px;
  bottom: -3px;
  color: #000;
  font-size: 10pt;
  font-weight: bold;
  line-height: 1.1;
  white-space: nowrap;
  text-shadow:
    -1px -1px 0 #fff,
    1px -1px 0 #fff,
    -1px 1px 0 #fff,
    1px 1px 0 #fff,
    -2px -2px 4px #fff,
    2px -2px 4px #fff,
    -2px 2px 4px #fff,
    2px 2px 4px #fff;
}

:global(.prts-widget-dark .item-icon-count) {
  color: #f1f3f5;
  text-shadow:
    -1px -1px 0 #111418,
    1px -1px 0 #111418,
    -1px 1px 0 #111418,
    1px 1px 0 #111418,
    -2px -2px 4px #000e,
    2px -2px 4px #000e,
    -2px 2px 4px #000e,
    2px 2px 4px #000e;
}
</style>
