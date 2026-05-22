<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

import { NTooltip } from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath, getImagePathWithRedirect } from "@/utils/utils";

import type { ItemData } from "./types";

const props = defineProps<{
  item: ItemData;
}>();

const imgSrc = ref("");
const itemUsage = ref(props.item.usage || "");
const itemDesc = ref(props.item.usage || "");

async function updateImgSrc() {
  if (props.item.filename === "" && props.item.iconId === "") {
    imgSrc.value = getImagePath(`无图片占位符.png`);
    return;
  }

  if (props.item.filename === "无") {
    imgSrc.value = await getImagePathWithRedirect(
      `道具_带框_${props.item.name}.png`,
    );
    return;
  }

  if (props.item.filename) {
    imgSrc.value = getImagePath(props.item.filename);
    return;
  }

  imgSrc.value = `${TORAPPU_ENDPOINT}/assets/item_icon/${props.item.iconId}.png`;
}

async function updateItemInfo() {
  const resp1 = await fetch(
    `/api.php?${new URLSearchParams({
      action: "parse",
      format: "json",
      text: props.item.usage,
      contentmodel: "wikitext",
      disablelimitreport: "1",
    })}`,
  );
  const data1 = await resp1.json();
  itemUsage.value = data1.parse.text["*"];

  const resp2 = await fetch(
    `/api.php?${new URLSearchParams({
      action: "parse",
      format: "json",
      text: props.item.description,
      contentmodel: "wikitext",
      disablelimitreport: "1",
    })}`,
  );
  const data2 = await resp2.json();
  itemDesc.value = data2.parse.text["*"];
}

onMounted(async () => {
  await updateImgSrc();
  await updateItemInfo();
});
watch(
  () => [
    props.item.filename,
    props.item.iconId,
    props.item.name,
    props.item.usage,
    props.item.description,
  ],
  () => {
    updateImgSrc();
    updateItemInfo();
  },
  { immediate: true },
);
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
            :src="imgSrc"
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
        v-html="itemUsage"
      ></div>
      <div
        v-if="item.description"
        class="text-gray-400 italic"
        v-html="itemDesc"
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
