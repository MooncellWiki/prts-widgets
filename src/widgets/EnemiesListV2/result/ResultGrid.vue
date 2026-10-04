<script setup lang="ts">
import { computed } from "vue";

import { STAT_COLS } from "../consts";
import { useEnemyList } from "../store";

import EnemyAvatar from "./EnemyAvatar.vue";
import GradeValue from "./GradeValue.vue";

/**
 * 结果 · 头像：设计系统的敌人卡（.ak-enemy，精英 / 领袖带左色条）排成网格，整张卡是链接；
 * 头像是带图鉴编号的方图。
 * 按属性排序时卡上带出那项的等级，不然在这个视图里看不出排的是什么。
 */
const { pageList, sortStat } = useEnemyList();

const sortCol = computed(() =>
  STAT_COLS.find((col) => col.key === sortStat.value),
);
</script>

<template>
  <div class="el-grid">
    <a
      v-for="enemy in pageList"
      :key="enemy.sortId"
      :class="[
        'el-cell',
        'ak-enemy',
        enemy.rank !== 'normal' && `ak-enemy--${enemy.rank}`,
      ]"
      :href="enemy.href"
    >
      <EnemyAvatar :enemy="enemy" />
      <div class="el-cell__id">
        <div class="ak-enemy__name">{{ enemy.name }}</div>
        <!-- 地位只画成色条，读屏另给一遍文字 -->
        <span v-if="enemy.rank !== 'normal'" class="ak-sr-only">
          {{ enemy.level }}
        </span>
        <div v-if="sortCol" class="el-cell__stat">
          {{ sortCol.short }} <GradeValue :value="enemy.stats[sortCol.key]" />
        </div>
      </div>
    </a>
  </div>
</template>

<style scoped lang="scss">
@use "../mixins";

.el-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(208px, 1fr));
  gap: var(--ak-space-2);

  // 手机上一行两张：头像收小一号
  .el--narrow & {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.el-cell {
  align-items: center;
  min-width: 0;
  color: var(--ak-fg);
  text-decoration: none;
  transition: border-color var(--ak-dur-normal);

  &:visited {
    color: var(--ak-fg);
  }

  // 悬停：细框换成强调色；精英 / 领袖的左色条照旧（色条与细框是 border-image 拼的，换的是细框那一段）
  &:hover {
    border-color: var(--ak-accent);
    color: var(--ak-fg);
    text-decoration: none;
  }

  &:is(.ak-enemy--elite, .ak-enemy--boss):hover {
    border-image-source: linear-gradient(
      to right,
      var(--_bar) 4px,
      var(--ak-accent) 4px
    );
  }

  &:focus-visible {
    @include mixins.focus-ring;
  }

  &__id {
    min-width: 0;
  }

  .ak-enemy__name {
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  &__stat {
    margin-top: 3px;
    font-size: var(--ak-fs-xs);
    line-height: 1.2;
    color: var(--ak-fg-muted);
  }

  .el--narrow & {
    --el-avatar: 52px;

    grid-template-columns: var(--el-avatar) 1fr;
    gap: 8px;
    padding: 8px;
  }
}
</style>
