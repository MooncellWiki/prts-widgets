<script setup lang="ts">
import { inject, type Ref } from "vue";

import { useVModel } from "@vueuse/core";

import { getLanguage, LANGUAGES } from "@/utils/i18n";
import { getImagePath } from "@/utils/utils";

import Equip from "./Equip.vue";

import type { CharEquips } from "../types";
const props = withDefaults(
  defineProps<{
    char: CharEquips;
    show?: boolean;
  }>(),
  {
    show: false,
  },
);
const shadowColor: Record<string, string> = {
  red: "#ef4444",
  green: "#84cc16",
  yellow: "#f59e0b",
  blue: "#3b82f6",
  purple: "#7e22ce",
  grey: "#52525b",
};
const emit = defineEmits<{
  "update:show": [boolean];
}>();

const showInfo = useVModel(props, "show", emit);
const showEquips = inject("showEquips") as Ref<string[]>;
const toggleShow = (c: CharEquips) => {
  if (c.equips.some((e) => !!e.name && showEquips.value.includes(e.name))) {
    for (const equip of props.char.equips) {
      if (!!equip.name && showEquips.value.includes(equip.name)) {
        const ind = showEquips.value.indexOf(equip.name);
        showEquips.value.splice(ind, 1);
      }
    }
    showInfo.value = false;
  } else {
    for (const equip of props.char.equips) {
      if (!!equip.name && !showEquips.value.includes(equip.name)) {
        showEquips.value.push(equip.name);
      }
    }
    showInfo.value = true;
  }
};
const locale = getLanguage();
</script>

<template>
  <div class="flex flex-col" :style="{ width: showInfo ? '100%' : 'auto' }">
    <div class="flex">
      <div
        class="relative m-[2px] inline-block h-[60px] w-[60px] flex-none cursor-pointer"
        @click="toggleShow(char)"
      >
        <img
          :src="getImagePath(`头像_${char.char.name}_2.png`)"
          width="60"
          height="60"
        />
        <span class="absolute bottom-[-8%] left-0 font-size-[18px] font-black">
          <span
            v-for="e in char.equips"
            :key="e.name"
            class="mx-0.5"
            :style="{
              filter:
                `drop-shadow(0 1px 0.8px ${shadowColor[e.color!] ?? 'grey'}) ` +
                `drop-shadow(0 -1px 0.8px ${shadowColor[e.color!] ?? 'grey'}) ` +
                `drop-shadow(1px 0 0.8px ${shadowColor[e.color!] ?? 'grey'}) ` +
                `drop-shadow(-1px 0 0.8px ${shadowColor[e.color!] ?? 'grey'}) `,
            }"
          >
            <img
              :src="getImagePath(`模组后缀_${e.type?.slice(-1)}.png`)"
              class="h-[9px] w-[9px]"
              width="9"
              height="9"
            />
          </span>
        </span>
      </div>
      <div v-if="showInfo" class="w-full flex items-center justify-center">
        <span v-if="locale === LANGUAGES.JA" class="font-bold">
          {{ char.char.nameJP ?? char.char.name }}
        </span>
        <span
          v-else-if="locale === LANGUAGES.EN || locale === LANGUAGES.KO"
          class="font-bold"
        >
          {{ char.char.nameEN ?? char.char.name }}
        </span>
        <span v-else class="font-bold">{{ char.char.name }}</span>
      </div>
    </div>
    <div v-if="showInfo" class="w-full">
      <Equip :name="char.char.name" :data="char.equips"></Equip>
    </div>
  </div>
</template>
