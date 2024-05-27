<script setup lang="ts">
import { NAvatar, NBadge, NCard } from "naive-ui";

import { getImagePath } from "@/utils/utils";
defineProps<{
  title?: string;
  type?: string;
  icon?: string;
  desc1?: string;
  desc2?: string;
  isTheme?: string;
}>();
</script>

<template>
  <NCard
    v-if="title || desc1 || desc2"
    :style="
      type === 'desc'
        ? { cursor: 'default' }
        : { cursor: 'pointer', borderColor: '#929292' }
    "
    :title="title"
    size="small"
    :header-style="{ height: '3.35em' }"
  >
    <template v-if="icon" #header-extra>
      <NAvatar
        v-if="type === 'simple'"
        color="#212121"
        object-fit="scale-down"
        :size="45"
        :src="getImagePath(`集成战略_选项_${icon}.png`)"
      />
      <NAvatar
        v-if="type === 'item'"
        color="#212121"
        object-fit="scale-down"
        :size="45"
        :src="getImagePath(`集成战略_道具_${icon}.png`)"
      />
      <NBadge v-if="type === 'collection'" :value="icon" color="#666666">
        <NAvatar
          color="#212121"
          object-fit="scale-down"
          :size="45"
          :src="
            getImagePath(
              isTheme ? `收藏品_${isTheme}_${icon}.png` : `收藏品_${icon}.png`,
            )
          "
        />
      </NBadge>
    </template>
    <div v-html="desc1" />
    <template v-if="desc2" #footer>
      <div class="text-xs" v-html="desc2" />
    </template>
  </NCard>
</template>
