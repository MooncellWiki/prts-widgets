<script setup lang="ts">
import { computed } from "vue";

import { NTooltip } from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath } from "@/utils/utils";

import type { ItemData } from "./types";

const props = defineProps<{
  item: ItemData;
}>();

const imgSrc = computed(() =>
  props.item.forceWikiFile
    ? getImagePath(`道具_带框_${props.item.name}.png`)
    : `${TORAPPU_ENDPOINT}/assets/item_icon/${props.item.iconId}.png`,
);
</script>

<template>
  <NTooltip trigger="hover" :delay="300">
    <template #trigger>
      <a :href="`/w/${item.name}`" class="inline-block">
        <div
          class="item-card relative overflow-hidden rounded"
          :style="{
            background: item.darkBackground ? '#2c2c2c' : undefined,
          }"
        >
          <img
            :src="imgSrc"
            :alt="item.name"
            loading="lazy"
            class="block"
            style="width: 80px; height: 80px"
          />
        </div>
      </a>
    </template>
    <div class="max-w-80 text-sm">
      <div class="mb-1 font-bold">{{ item.name }}</div>
      <div v-if="item.usage" class="mb-1 text-gray-300">
        {{ item.usage }}
      </div>
      <div v-if="item.description" class="text-gray-400">
        {{ item.description }}
      </div>
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
</style>
