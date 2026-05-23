<script setup lang="ts">
import { NTooltip } from "naive-ui";

import type { ItemData } from "./types";

defineProps<{
  item: ItemData;
}>();
</script>

<template>
  <NTooltip trigger="hover" :delay="300">
    <template #trigger>
      <a :href="`/w/${item.name}`" class="inline-block text-center">
        <div
          class="item-card relative overflow-hidden rounded"
          :style="{
            background: item.darkBackground ? '#2c2c2c' : undefined,
          }"
        >
          <img
            :src="item.imgSrc"
            :alt="item.name"
            loading="lazy"
            class="block"
            style="width: 80px; height: 80px; object-fit: contain"
          />
        </div>
        <div
          class="mt-1 w-[80px] text-xs text-gray-600 leading-tight dark:text-gray-300"
        >
          {{ item.name }}
        </div>
      </a>
    </template>
    <div class="max-w-80 text-sm">
      <div class="mb-1 font-bold">{{ item.name }}</div>
      <div
        v-if="item.usage"
        class="mb-1 text-gray-300"
        v-html="item.usageHtml"
      ></div>
      <div
        v-if="item.description"
        class="text-gray-400 italic"
        v-html="item.descriptionHtml"
      ></div>
    </div>
  </NTooltip>
</template>

<style scoped>
.item-card {
  transition: transform 0.15s ease;
}
.item-card:hover {
  transform: scale(1.1);
  z-index: 1;
}
:deep(a) {
  color: orange !important;
}
</style>
