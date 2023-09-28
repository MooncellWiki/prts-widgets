<script lang="ts">
import { computed, PropType, defineComponent } from "vue";

import { useVModel } from "@vueuse/core";
import { NCard, NPopover } from "naive-ui";

import { getImagePath } from "@/utils/utils";

import { CharMemory, Memory } from "./types";

export default defineComponent({
  name: "Memory",
  components: {
    NCard,
    NPopover,
  },
  props: {
    charMemory: {
      type: Object as PropType<CharMemory>,
      required: true,
    },
  },
  emits: ["update:charMemory"],
  setup(props, { emit }) {
    const charmRef = useVModel(props, "charMemory", emit);
    const src = computed(() => {
      switch (charmRef.value.rarity) {
        case "3":
        case "4":
        case "5":
          return `/images/${getImagePath(`头像_${charmRef.value.char}_2.png`)}`;
        case "0":
        case "1":
        case "2":
        default:
          return `/images/${getImagePath(`头像_${charmRef.value.char}.png`)}`;
      }
    });
    const link = computed(() => {
      return `/w/${charmRef.value.char}`;
    });
    const srcelite2 = `/images/${getImagePath("图标_升级_精英化2.png")}`;
    const srcelite1 = `/images/${getImagePath("图标_升级_精英化1.png")}`;
    const srcelite0 = `/images/${getImagePath("图标_升级_精英化0.png")}`;
    const getSrcElite = (elite: string) => {
      switch (elite) {
        case "2":
          return srcelite2;
        case "1":
          return srcelite1;
        case "0":
        default:
          return srcelite0;
      }
    };
    const getSrcMedal = (mmr: Memory) => {
      const searchstr = mmr.medal.replace(" ", "_");
      return `/images/${getImagePath(`蚀刻章_${searchstr}.png`)}`;
    };
    const srcfavor = `/images/${getImagePath("图标_信赖.png")}`;
    const srcplay = `/images/${getImagePath("情报处理室_播放按钮.png")}`;
    return {
      charmRef,
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
        <span class="text-sm">{{ charmRef.char }}</span>
      </div>
      <div class="flex flex-col basis-4/5 justify-center items-center">
        <div
          v-for="mmr in charmRef.memories"
          :key="mmr.name"
          class="flex flex-col w-full"
        >
          <div
            class="flex text-white w-full text-3 items-center py-[3px]"
            style="background-color: #313131"
          >
            <div
              class="flex max-md:flex-col max-md:min-w-[5em] md:min-w-[9em] px-1 b-r-white b-r-solid b-r-1"
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
              <NPopover trigger="hover">
                <template #trigger>
                  <a :href="`/w/光荣之路#${mmr.medal}`">
                    <div
                      class="flex justify-center items-center w-[40]"
                      style="
                        border-radius: 3px;
                        background: linear-gradient(
                          0deg,
                          #ffffff38,
                          transparent
                        );
                      "
                    >
                      <span class="mdi mdi-medal text-4 text-white"></span>
                      <img :src="getSrcMedal(mmr)" width="20" />
                    </div>
                  </a>
                </template>
                <div
                  class="flex flex-col items-center w-[120px] p-2 bg-[#2f2f2f]"
                >
                  <img :src="getSrcMedal(mmr)" width="100" />
                </div>
              </NPopover>
            </div>
          </div>
          <div v-for="info in mmr.info" :key="info.link" class="flex flex-col">
            <div v-if="info.link != mmr.info[0].link" class="sep" />
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
<style scoped>
:deep(.sep) {
  height: 1px;
  width: 100%;
  background-color: grey;
}
</style>
