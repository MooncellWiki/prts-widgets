<script setup lang="ts">
import { AkTag } from "@mooncellwiki/prts-design-vue";

/**
 * 「隐藏势力」标志：这位干员要算上 ingameFaction.hidden 才通过作战势力筛选（见 hiddenOnlyMatch）。
 * 用设计系统的反转标签：黑白反转本来就是强调，不去占青（可点 / 选中）、黄（稀有度星）、紫（四星色）。
 * 卡片角上地方小，只露「隐藏」，「势力」两字留给读屏。
 */
defineProps<{
  /** 只露「隐藏」两字（卡片角上） */
  short?: boolean;
}>();
</script>

<template>
  <AkTag class="ol-hidden" variant="inverse" size="sm"
    >隐藏<span :class="{ 'ak-sr-only': short }">势力</span></AkTag
  >
</template>
