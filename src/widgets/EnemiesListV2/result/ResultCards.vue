<script setup lang="ts">
import { STAT_COLS } from "../consts";
import { useEnemyList } from "../store";

import EnemyAvatar from "./EnemyAvatar.vue";
import GradeValue from "./GradeValue.vue";

import type { Enemy } from "../enemy";

/**
 * 结果 · 卡片：结果区窄于 1000（平板 / 手机）时代替表格。
 * 外框是设计系统的敌人卡（.ak-enemy：头像 + 名字，精英 / 领袖带左色条），头像换成带图鉴编号的方图，
 * 下面接着摊开八项属性的 4 × 2 格与能力全文。
 */
const { pageList, sortStat } = useEnemyList();

const kinds = (enemy: Enemy) =>
  [enemy.race, enemy.motion, ...enemy.attackType, ...enemy.damageType]
    .filter(Boolean)
    .join(" · ");
</script>

<template>
  <div class="el-cards">
    <article
      v-for="enemy in pageList"
      :key="enemy.sortId"
      :class="[
        'el-card',
        'ak-enemy',
        enemy.rank !== 'normal' && `ak-enemy--${enemy.rank}`,
      ]"
    >
      <a :href="enemy.href" tabindex="-1" aria-hidden="true">
        <EnemyAvatar :enemy="enemy" />
      </a>
      <div class="el-card__id">
        <a class="ak-enemy__name el-card__name" :href="enemy.href">
          {{ enemy.name }}
        </a>
        <!-- 地位只画成色条，读屏另给一遍文字 -->
        <span v-if="enemy.rank !== 'normal'" class="ak-sr-only">
          {{ enemy.level }}
        </span>
        <span class="el-sub">{{ kinds(enemy) }}</span>
      </div>
      <dl class="el-card__stats">
        <div
          v-for="col in STAT_COLS"
          :key="col.key"
          :class="{ 'is-sorted': sortStat === col.key }"
        >
          <dt>{{ col.short }}</dt>
          <dd><GradeValue :value="enemy.stats[col.key]" /></dd>
        </div>
      </dl>
      <!-- abilityHtml 是 convertAbility 转义后重新拼的，不是数据原文 -->
      <p
        v-if="enemy.abilityHtml"
        class="el-ability"
        v-html="enemy.abilityHtml"
      />
    </article>
  </div>
</template>

<style scoped lang="scss">
@use "../mixins";

.el-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--ak-space-2);
}

.el-card {
  align-content: start;
  gap: 8px 12px;
  min-width: 0;

  &__id {
    align-self: center;
    min-width: 0;
  }

  &__name {
    display: block;
    margin: 0 0 3px;
    line-height: 1.25;
    color: var(--ak-fg);
    text-decoration: none;
    overflow-wrap: anywhere;

    &:hover {
      color: var(--ak-accent);
      text-decoration: underline;
    }
  }

  // 八项属性摊开成 4 × 2 的格，横跨头像与名字两列
  &__stats {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    margin: 0;
    background: var(--ak-border);
    border: 1px solid var(--ak-border);

    > div {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 4px;
      padding: 5px 8px;
      background: var(--ak-bg-surface);

      &.is-sorted {
        background: var(--ak-accent-subtle);
      }
    }

    dt {
      // 低分屏抬到中文最小字号；宿主皮肤还没有这个变量时照 10px
      font-size: max(10px, var(--ak-fs-cjk-min, 0px));
      line-height: 1;
      font-weight: 500;
      color: var(--ak-fg-muted);
      white-space: nowrap;
    }

    dd {
      margin: 0;
      font-size: var(--ak-fs-sm);
      line-height: 1;
    }
  }

  p {
    grid-column: 1 / -1;
    margin: 0;
  }
}

.el-sub {
  @include mixins.sub;
}

.el-ability {
  @include mixins.ability;
}
</style>
