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
    :data-rarity="char.rarity + 1"
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
