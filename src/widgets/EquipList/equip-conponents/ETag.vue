<script setup lang="ts">
import { NTooltip } from "naive-ui";

import { getImagePath } from "@/utils/utils";

defineProps<{
  type: "lv" | "favor" | "mission";
  value: string;
}>();
</script>

<template>
  <NTooltip>
    <template #trigger>
      <div
        v-if="type === 'lv' || type === 'favor'"
        class="pos-relative inline-block"
      >
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
        <img
          :src="
            getImagePath(
              `图标_模组需求_${type === 'favor' ? '信赖' : '精英2等级'}.png`,
            )
          "
          width="50"
          loading="lazy"
        />
      </div>
      <div
        v-else
        class="pos-relative mx-2px inline-block h-[40px] w-[40px] transform-translate-y-[10%] border-[2px] border-[#00b1ff] border-rd-[50%] border-solid bg-[#2f2f2f]"
        style="box-shadow: 0 2px 4px 0px #00000099"
      >
        <div class="h-[43px] flex items-center justify-center">
          <span class="mdi mdi-clipboard-check font-size-[24px] color-white">
          </span>
        </div>
      </div>
    </template>
    <span v-if="type === 'lv'">
      需要达到等级<br />(精英<span class="font-bold">2</span>阶段)
    </span>
    <span v-if="type === 'favor'">
      需要信赖值(<span class="font-bold">%</span>)
    </span>
  </NTooltip>
</template>
