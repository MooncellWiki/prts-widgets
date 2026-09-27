<script setup lang="ts">
import { computed } from "vue";

import { wikiImage, wikiLink } from "../utils";

// 对应 模板:招聘合同：183px 的合同底图上叠一张头像，偏移与缩放按原模板的比例换算
const props = withDefaults(
  defineProps<{
    name: string;
    /** 0 起算的稀有度 */
    rarity: number;
    size?: number;
  }>(),
  { size: 50 },
);

const avatarStyle = computed(() => ({
  top: `${Math.round((props.size / 183) * 35)}px`,
  left: `${Math.round((props.size / 183) * 36)}px`,
  width: `${Math.round((props.size / 183) * 93)}px`,
}));
</script>

<template>
  <a
    class="contract-icon"
    :href="wikiLink(name)"
    :title="name"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <img
      :src="wikiImage(`招聘合同_${rarity}.png`)"
      :width="size"
      :height="size"
      loading="lazy"
      alt=""
    />
    <img
      class="contract-icon-avatar"
      :src="wikiImage(`头像_${name}.png`)"
      :style="avatarStyle"
      :alt="name"
      loading="lazy"
    />
  </a>
</template>

<style scoped>
.contract-icon {
  position: relative;
  display: inline-block;
  line-height: 0;
  vertical-align: middle;
}

.contract-icon-avatar {
  position: absolute;
  height: auto;
}
</style>
