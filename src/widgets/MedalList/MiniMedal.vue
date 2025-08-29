<script setup lang="ts">
import { NGradientText, NImage, NTooltip } from "naive-ui";

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
        :src="`${TORAPPU_ENDPOINT}/assets/medal_icon/${medalData.picId}.png`"
        preview-disabled
        :img-props="{
          style: {
            background: medalData.isTrim
              ? 'linear-gradient(0deg, #1d0942, #485a5c)'
              : 'linear-gradient(0deg, #0009, #444)',
            borderRadius: '2px',
            height: '30px',
            paddingInline: '1px',
          },
        }"
      />
    </template>
    <b v-if="!medalData.isTrim">{{ medalData.name }}</b>
    <NGradientText
      v-else
      :gradient="{
        deg: 180,
        from: '#bbf7ff',
        to: '#e2d7ff',
      }"
    >
      <b>{{ medalData.name }}&nbsp;[ 镀层 ]</b>
    </NGradientText>
    <br />{{ medalData.method }}
  </NTooltip>
</template>
