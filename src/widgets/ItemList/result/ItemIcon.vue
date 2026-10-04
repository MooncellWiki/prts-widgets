<script setup lang="ts">
import { PLACEHOLDER_ICON, type Item } from "../item";

/**
 * 道具图标：设计系统 .ak-item 的结构（合成图自带底框，占满框）。
 * 不用 AkItem 组件，是因为一页上百张图要 loading="lazy"，取不到图时还要换占位图；
 * 道具名就写在图旁边，alt 留空免得读两遍。
 */
defineProps<{
  item: Item;
  size?: "sm" | "lg";
}>();

/** 只换一次：占位图自己也取不到时不再重试 */
function onError(e: Event) {
  const img = e.target as HTMLImageElement;
  if (img.dataset.fallback) return;
  img.dataset.fallback = "1";
  img.src = PLACEHOLDER_ICON;
}
</script>

<template>
  <span
    :class="[
      'ak-item',
      size && `ak-item--${size}`,
      { 'il-icon--dark': item.dark },
    ]"
  >
    <img
      :src="item.icon"
      alt=""
      loading="lazy"
      decoding="async"
      @error="onError"
    />
  </span>
</template>

<style scoped lang="scss">
// 白色线稿的图标（集成战略的几种代币）：垫一块道具底框那样的深色圆底（底色同旧版），图缩进圆里
.il-icon--dark {
  background: #2c2c2c;
  border-radius: 50%;

  > img {
    width: 62%;
    height: 62%;
  }
}
</style>
