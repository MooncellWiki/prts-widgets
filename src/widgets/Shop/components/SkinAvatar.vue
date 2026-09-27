<script setup lang="ts">
import { computed } from "vue";

import { wikiImage } from "../utils";

// 对应 模板:皮肤头像：164×163 的 Skin框 上叠时装头像
const props = withDefaults(
  defineProps<{
    charName: string;
    skinIndex: string;
    href: string;
    title?: string;
    size?: number;
  }>(),
  { size: 50 },
);

const avatarStyle = computed(() => ({
  top: `${Math.round((props.size / 163) * 28)}px`,
  left: `${Math.round((props.size / 164) * 35)}px`,
  width: `${Math.round((props.size / 164) * 92)}px`,
}));
</script>

<template>
  <a
    class="skin-avatar"
    :href="href"
    :title="title"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <img :src="wikiImage('Skin框.png')" :width="size" loading="lazy" alt="" />
    <img
      class="skin-avatar-image"
      :src="wikiImage(`头像_${charName}_skin${skinIndex}.png`)"
      :style="avatarStyle"
      :alt="title"
      loading="lazy"
    />
  </a>
</template>

<style scoped>
.skin-avatar {
  position: relative;
  display: inline-block;
  line-height: 0;
  vertical-align: middle;
}

.skin-avatar-image {
  position: absolute;
  height: auto;
}
</style>
