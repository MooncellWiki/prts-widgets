<script lang="ts" setup>
import { computed } from "vue";

import { NCard, NDivider, NPopover } from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath } from "@/utils/utils";

import { CharMemory, Memory } from "./types";

const getSrcMedal = (mmr: Memory) =>
  `${TORAPPU_ENDPOINT}/assets/medal_icon/${mmr.medal.id}.png`;

const getSrcElite = (elite: string) =>
  getImagePath(`图标_升级_精英化${elite || "0"}.png`);
const props = withDefaults(
  defineProps<{
    charMemory: CharMemory;
    isNew: boolean;
  }>(),
  {
    isNew: false,
  },
);

const src = computed(() => {
  const lowRarityImg = getImagePath(`头像_${props.charMemory.char}.png`);
  const highRarityImg = getImagePath(`头像_${props.charMemory.char}_2.png`);
  try {
    const rarity = Number.parseInt(props.charMemory.rarity);
    return rarity >= 3 ? highRarityImg : lowRarityImg;
  } catch {
    return lowRarityImg;
  }
});
const link = computed(() => {
  return `/w/${props.charMemory.char}`;
});
const srcfavor = getImagePath("图标_信赖.png");
const srcplay = getImagePath("情报处理室_播放按钮.png");
</script>

<template>
  <NCard
    class="m-1 w-[calc(100%-0.5rem)] lg:w-[calc(50%-0.5rem)]"
    content-style="padding: 0.5rem;"
    size="small"
    hoverable
  >
    <div class="h-full flex flex-row items-center justify-center">
      <div
        class="min-w-[95px] flex basis-1/5 flex-col items-center justify-center"
      >
        <a :href="link">
          <img
            class="m-[2px] cursor-pointer"
            :src="src"
            width="60"
            height="60"
          />
        </a>
        <span class="text-sm">{{ charMemory.char }}</span>
      </div>
      <div class="flex basis-4/5 flex-col items-center justify-center">
        <div
          v-if="isNew"
          class="my-1 w-full flex flex-col bg-orange text-center text-white"
        >
          有新增密录
        </div>
        <div
          v-for="mmr in charMemory.memories"
          :key="mmr.name"
          class="w-full flex flex-col"
        >
          <div
            class="w-full flex items-center bg-[#313131] py-[3px] text-3 text-white"
          >
            <div
              class="min-w-[4em] flex flex-wrap b-r-1 b-r-white b-r-solid px-1 md:min-w-[9em]"
            >
              <div class="flex items-center">
                <img width="15" class="pr-1" :src="getSrcElite(mmr.elite)" />
                <span class="font-bold">Lv.{{ mmr.level }}</span>
              </div>
              <div class="flex items-center">
                <img width="14" class="p-1" :src="srcfavor" />
                <span class="font-bold">{{ mmr.favor }}%</span>
              </div>
            </div>
            <div class="mx-1 w-full flex items-center justify-between">
              <span>{{ mmr.name }}</span>
              <NPopover trigger="hover" placement="top-end">
                <template #trigger>
                  <div
                    class="w-[40] flex items-center justify-center"
                    style="
                      border-radius: 3px;
                      background: linear-gradient(0deg, #ffffff38, transparent);
                    "
                  >
                    <span class="mdi mdi-medal text-4 text-white"></span>
                    <img :src="getSrcMedal(mmr)" width="20" />
                  </div>
                </template>
                <div
                  class="w-[200px] flex flex-col items-center bg-[#2f2f2f] p-2"
                >
                  <img :src="getSrcMedal(mmr)" width="100" />
                  <span class="py-1 text-white font-bold">
                    {{ mmr.medal.medal }}
                  </span>
                  <span class="py-1 text-3 text-white italic">
                    {{ mmr.medal.desc }}
                  </span>
                </div>
              </NPopover>
            </div>
          </div>
          <div v-for="info in mmr.info" :key="info.link" class="flex flex-col">
            <NDivider v-if="info.link != mmr.info[0].link" />
            <div class="flex flex-nowrap px-1 py-2">
              <div class="flex-basis-4/5">
                {{ info.intro }}
              </div>
              <div
                class="min-w-[5em] flex flex-basis-1/5 items-center justify-center"
              >
                <a :href="`/w/${info.link}`">
                  <img width="50" :src="srcplay" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </NCard>
</template>

<style scoped></style>
