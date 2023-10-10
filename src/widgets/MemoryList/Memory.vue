<script lang="ts">
import { PropType, computed, defineComponent } from "vue";

import { NCard, NDivider, NPopover } from "naive-ui";

import { getImagePath } from "@/utils/utils";

import { CharMemory, Memory } from "./types";

export default defineComponent({
  name: "Memory",
  components: {
    NCard,
    NDivider,
    NPopover,
  },
  props: {
    charMemory: {
      type: Object as PropType<CharMemory>,
      required: true,
    },
  },
  emits: ["update:charMemory"],
  setup(props) {
    const src = computed(() => {
      const lowRarityImg = `/images/${getImagePath(
        `头像_${props.charMemory.char}.png`,
      )}`;
      const highRarityImg = `/images/${getImagePath(
        `头像_${props.charMemory.char}_2.png`,
      )}`;
      try {
        const rarity = parseInt(props.charMemory.rarity);
        return rarity >= 3 ? highRarityImg : lowRarityImg;
      } catch (e) {
        return lowRarityImg;
      }
    });
    const link = computed(() => {
      return `/w/${props.charMemory.char}`;
    });
    const getSrcElite = (elite: string) => {
      return `/images/${getImagePath(`图标_升级_精英化${elite || "0"}.png`)}`;
    };
    const getSrcMedal = (mmr: Memory) => {
      const search = mmr.medal.alias.replace(" ", "_");
      return `/images/${getImagePath(`蚀刻章_${search}.png`)}`;
    };
    const srcfavor = `/images/${getImagePath("图标_信赖.png")}`;
    const srcplay = `/images/${getImagePath("情报处理室_播放按钮.png")}`;
    return {
      src,
      link,
      srcfavor,
      srcplay,
      getSrcElite,
      getSrcMedal,
      getImagePath,
    };
  },
});
</script>

<template>
  <NCard
    class="w-[calc(100%-0.5rem)] lg:w-[calc(50%-0.5rem)] m-1"
    content-style="padding: 0.5rem;"
    size="small"
    hoverable
  >
    <div class="flex flex-row justify-center items-center h-full">
      <div
        class="flex flex-col min-w-[95px] basis-1/5 justify-center items-center"
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
      <div class="flex flex-col basis-4/5 justify-center items-center">
        <div
          v-for="mmr in charMemory.memories"
          :key="mmr.name"
          class="flex flex-col w-full"
        >
          <div
            class="flex text-white w-full text-3 items-center py-[3px] bg-[#313131]"
          >
            <div
              class="flex flex-wrap min-w-[4em] md:min-w-[9em] px-1 b-r-white b-r-solid b-r-1"
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
            <div class="flex items-center justify-between mx-1 w-full">
              <span>{{ mmr.name }}</span>
              <NPopover trigger="hover" placement="top-end">
                <template #trigger>
                  <div
                    class="flex justify-center items-center w-[40]"
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
                  class="flex flex-col items-center w-[200px] p-2 bg-[#2f2f2f]"
                >
                  <img :src="getSrcMedal(mmr)" width="100" />
                  <span class="font-bold py-1 text-white">
                    {{ mmr.medal.medal }}
                  </span>
                  <span class="italic text-3 py-1 text-white">
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
                class="flex flex-basis-1/5 justify-center items-center min-w-[5em]"
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
