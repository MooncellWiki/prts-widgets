<script setup lang="ts">
import { avatar, onImageError } from "@/utils/charImage";

import { professionBadge, wikiLink } from "../assets";

import type { Char } from "../utils";

/** 表格 / 卡片里的小头像：稀有度色渐变底（.ak-r-avatar，同干员卡）+ 左上角职业小图标。名字旁边另有链接，这枚不进 Tab 序 */
defineProps<{ char: Char }>();
</script>

<template>
  <a
    class="ol-avatar ak-r-avatar"
    :href="wikiLink(char.zh)"
    :data-rarity="char.stars"
    tabindex="-1"
    aria-hidden="true"
    @error.capture="onImageError"
  >
    <img
      :src="avatar(char)"
      alt=""
      width="48"
      height="48"
      loading="lazy"
      decoding="async"
    />
    <img
      class="ol-avatar__prof"
      :src="professionBadge(char.profession)"
      alt=""
      width="16"
      height="16"
    />
  </a>
</template>

<style scoped lang="scss">
.ol-avatar {
  position: relative;
  display: block;
  width: 48px;
  height: 48px;
  // 底色来自 .ak-r-avatar（稀有度色渐变），头像下面不再拉同色的色条
  overflow: hidden;

  > img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  > img.ol-avatar__prof {
    position: absolute;
    left: 0;
    top: 0;
    width: 16px;
    height: 16px;
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }
}
</style>
