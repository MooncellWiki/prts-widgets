<script setup lang="ts">
import { NImage, NTooltip } from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";

import type { MiniMedal } from "./types";

defineProps<{
  medalData: MiniMedal;
}>();
</script>

<template>
  <NTooltip trigger="hover" class="text-center">
    <template #trigger>
      <NImage
        class="pr-0.5"
        :src="`${TORAPPU_ENDPOINT}/assets/medal_icon/${medalData.id}.png`"
        preview-disabled
        :img-props="{
          style: {
            background: 'linear-gradient(0deg, #0009, #444)',
            borderRadius: '2px',
            height: '30px',
            paddingInline: '1px',
          },
        }"
      />
    </template>
    <b>{{ medalData.name }}</b>
    <br />{{ medalData.method }}
  </NTooltip>
</template>
