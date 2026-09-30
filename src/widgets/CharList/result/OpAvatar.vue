<script setup lang="ts">
import { avatar, professionBadge, wikiLink } from "../assets";

import type { Char } from "../utils";

/** 表格 / 卡片里的小头像：稀有度色底线 + 左上角职业小图标。名字旁边另有链接，这枚不进 Tab 序 */
defineProps<{ char: Char }>();
</script>

<template>
  <a
    class="ol-avatar"
    :href="wikiLink(char.zh)"
    :data-rarity="char.stars"
    tabindex="-1"
    aria-hidden="true"
  >
    <img
      :src="avatar(char.zh)"
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
  background: #1d1f20 linear-gradient(180deg, #2b2d2f, #141516);
  border-bottom: 3px solid var(--ak-r, var(--ak-border-strong));
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
