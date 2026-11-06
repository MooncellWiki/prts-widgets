<script setup lang="ts">
import { computed } from "vue";

import { STAT_COLS } from "../consts";
import { useEnemyList } from "../store";

import EnemyAvatar from "./EnemyAvatar.vue";

import type { Enemy } from "../enemy";

/**
 * 结果 · 头像（简易模式）：只有头像，同改版前的「简」——80px 方图一个挨一个，每张链到敌人页；整块居中，窄屏上图跟着列宽伸缩、铺满整行；
 * 头像是带图鉴编号的方图（同现网敌人页的头像，不垫底色）。名字放在悬停 / 聚焦的提示里（气泡由根组件画），读屏另给一遍文字；
 * 按属性排序时提示里带出那项的等级，不然在这个视图里看不出排的是什么。
 */
const { pageList, sortStat } = useEnemyList();

const sortCol = computed(() =>
  STAT_COLS.find((col) => col.key === sortStat.value),
);

const tip = (enemy: Enemy) =>
  sortCol.value
    ? `${enemy.name}\n${sortCol.value.full} ${enemy.stats[sortCol.value.key]}`
    : enemy.name;
</script>

<template>
  <div class="el-grid">
    <a
      v-for="enemy in pageList"
      :key="enemy.sortId"
      class="el-cell"
      :href="enemy.href"
      :data-tip="tip(enemy)"
    >
      <EnemyAvatar :enemy="enemy" />
      <span class="ak-sr-only">{{ enemy.name }}</span>
      <span v-if="enemy.rank !== 'normal'" class="ak-sr-only">
        {{ enemy.level }}
      </span>
    </a>
  </div>
</template>

<style scoped lang="scss">
@use "../mixins";

// 一个挨一个、不留缝（同改版前）：图四周自带的那圈阴影就是间距。
// 80 一列，整块居中（排不满的末行照旧从第一列起，同上面各行对齐）
.el-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 80px);
  justify-content: center;

  // 窄屏上固定 80 会在两边空出大半列：改成等分的列（不小于 72），图跟着列宽伸缩，一行总是铺满
  .el--narrow & {
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  }
}

// 图的边长就是列宽
.el-cell {
  --el-avatar: 100%;

  position: relative;
  display: block;

  // 悬停 / 聚焦框都贴着图的实边画（压在编号条上面），不然隔着图四周那圈阴影悬在外面；阴影同编号条一样留 7 / 130
  &:is(:hover, :focus-visible)::after {
    content: "";
    position: absolute;
    inset: calc(100% * 7 / 130);
    pointer-events: none;
  }

  // 悬停：实边上压一圈强调色的内框
  &:hover::after {
    box-shadow: inset 0 0 0 2px var(--ak-accent);
  }

  // 聚焦：框画在实边外侧那 2px 上（图宽可能是百分比，outline-offset 没法照比例缩进，所以挂在 ::after 上）
  &:focus-visible {
    outline: none;
  }

  &:focus-visible::after {
    @include mixins.focus-ring(0);
  }
}
</style>
