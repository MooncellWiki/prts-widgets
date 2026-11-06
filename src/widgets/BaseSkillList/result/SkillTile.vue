<script setup lang="ts">
import { skillIcon } from "../assets";

import type { Buff } from "../data";

/**
 * 技能方砖：游戏技能名条的底色（BuildingBuffDescView 的 _bkgTitle = buffColor）+ 白色技能图标。
 * 现网是 #999 灰底，暗色下要靠 {{#widget:style}} 另改。
 */
defineProps<{ buff: Buff; small?: boolean }>();
</script>

<template>
  <span
    :class="['rs-tile', { 'rs-tile--sm': small }]"
    :style="{ '--rs-bg': buff.color }"
    aria-hidden="true"
  >
    <img
      :src="skillIcon(buff.icon)"
      alt=""
      :width="small ? 22 : 38"
      :height="small ? 22 : 38"
      loading="lazy"
      decoding="async"
    />
  </span>
</template>

<style scoped lang="scss">
.rs-tile {
  position: relative;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  background: var(--rs-bg, var(--ak-gray-700));

  > img {
    width: 38px;
    height: 38px;
    object-fit: contain;
    // 游戏的技能图标是白色线稿，淡底色（制造站的黄、加工站的黄绿）上描一圈淡影
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.25));
  }

  &--sm {
    width: 28px;
    height: 28px;

    > img {
      width: 22px;
      height: 22px;
    }
  }

  // 结果区窄：方砖缩小
  .rs--compact &:not(.rs-tile--sm) {
    width: 36px;
    height: 36px;

    > img {
      width: 28px;
      height: 28px;
    }
  }
}
</style>
