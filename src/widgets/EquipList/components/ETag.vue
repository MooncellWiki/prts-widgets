<script setup lang="ts">
import { NTooltip } from "naive-ui";

import { getLanguage } from "@/utils/i18n";

import { tagIconFavor, tagIconOther } from "../consts";
import { customLabel } from "../i18n";

defineProps<{
  type: "lv" | "favor" | "mission";
  value: string;
}>();

const getIconSrc = (type: string) => {
  return type === "favor" ? tagIconFavor : tagIconOther;
};
</script>

<template>
  <NTooltip trigger="hover">
    <template #trigger>
      <div
        v-if="type === 'lv' || type === 'favor'"
        class="inline-block h-[50px] w-[50px]"
      >
        <div class="relative inline-block">
          <span
            class="pointer-events-none absolute top-[25px] w-[50px] transform-translate-y-[-50%] whitespace-nowrap text-center font-size-[20px] font-bold color-white!"
            style="
              text-shadow:
                0 0 5px black,
                0 0 5px black,
                0 0 5px black,
                0 0 5px black;
            "
          >
            {{ value }}
          </span>
          <img :src="getIconSrc(type)" width="50" loading="lazy" />
        </div>
      </div>
      <div v-else class="ml-5px mr-3px inline-block h-[50px] w-[50px]">
        <div
          class="relative my-2px inline-block h-[40px] w-[40px] transform-translate-y-[5px] border-[2px] border-[#00b1ff] border-rd-[50%] border-solid bg-[#2f2f2f] shadow-[0_2px_4px_0px_#00000099]"
        >
          <div class="h-[40px] flex items-center justify-center">
            <span
              class="mdi mdi-clipboard-check font-size-[24px] text-white"
            ></span>
          </div>
        </div>
      </div>
    </template>
    <div v-if="type === 'lv'">
      {{ customLabel[getLanguage()].equipString.condLv }}
    </div>
    <div v-if="type === 'favor'">
      {{ customLabel[getLanguage()].equipString.condTrust }}
    </div>
    <div v-if="type === 'mission'">
      {{ customLabel[getLanguage()].equipString.condMission }}
    </div>
  </NTooltip>
</template>
