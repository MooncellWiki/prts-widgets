<script setup lang="ts">
import { onImageError } from "@/utils/charImage";

import { enemyAvatar } from "../assets";

import type { Enemy } from "../enemy";

/**
 * 敌人头像：方图原样铺满，图鉴编号叠在左上角的深色条上（游戏敌人图鉴的格子 EnemyHandBookItemView 同款）。
 * 边长由外面用 --el-avatar 定，默认 64；站内还没传图的留下深色底框和编号。
 */
defineProps<{ enemy: Enemy }>();
</script>

<template>
  <span class="el-avatar">
    <img
      :src="enemyAvatar(enemy)"
      alt=""
      loading="lazy"
      decoding="async"
      @error="onImageError"
    />
    <span v-if="enemy.index" class="el-avatar__index">{{ enemy.index }}</span>
  </span>
</template>

<style scoped lang="scss">
.el-avatar {
  position: relative;
  display: block;
  width: var(--el-avatar, 64px);
  height: var(--el-avatar, 64px);
  background: #1d1f20 linear-gradient(180deg, #2b2d2f, #141516);
  overflow: hidden;

  > img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__index {
    position: absolute;
    top: 0;
    left: 0;
    box-sizing: border-box;
    min-width: 42%;
    padding: 2px 4px 1px;
    background: rgba(29, 31, 32, 0.78);
    color: #fff;
    font: 700 10px / 1.15 var(--ak-font-label);
    letter-spacing: 0.02em;
    text-align: center;
    white-space: nowrap;
  }
}
</style>
