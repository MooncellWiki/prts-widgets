<script setup lang="ts">
import { STAT_COLS, type SortKey } from "../consts";
import { useEnemyList } from "../store";

import EnemyAvatar from "./EnemyAvatar.vue";
import GradeValue from "./GradeValue.vue";

/**
 * 结果 · 表格。一个敌人 = 一个 <tbody>：
 * 上行是头像（左上角带图鉴编号）+ 名称 + 种类 / 攻击方式 + 八项属性各占一列（点表头排序）；
 * 有能力的另起一行写全文——能力长的有十几条，单独成行才不把属性列挤窄。
 * 地位看头像左边的色条：精英橙、领袖红（筛选面板「地位」行的色块是图例）。
 * 结果区窄于 1000 时放不下，换成 ResultCards。
 */
const store = useEnemyList();
const { state, pageList, sortStat } = store;

const ariaSort = (key: SortKey) =>
  state.sort.key === key
    ? state.sort.dir > 0
      ? "ascending"
      : "descending"
    : undefined;
</script>

<template>
  <table class="ak-table el-table">
    <colgroup>
      <col style="width: 82px" />
      <col style="width: 20%" />
      <col style="width: 11%" />
      <col style="width: 12%" />
      <col v-for="col in STAT_COLS" :key="col.key" />
    </colgroup>
    <thead>
      <tr>
        <th scope="col"><span class="ak-sr-only">头像</span></th>
        <th scope="col" :aria-sort="ariaSort('name')">
          <button
            type="button"
            class="ak-table__sort"
            @click="store.cycleSort('name')"
          >
            敌人
          </button>
        </th>
        <th scope="col">种类 / 行动</th>
        <th scope="col">攻击 / 伤害</th>
        <th
          v-for="(col, i) in STAT_COLS"
          :key="col.key"
          scope="col"
          :class="['el-c-stat', { 'el-sep': i % 4 === 0 }]"
          :title="col.full"
          :aria-sort="ariaSort(col.key)"
        >
          <button
            type="button"
            class="ak-table__sort"
            @click="store.cycleSort(col.key)"
          >
            {{ col.short }}
          </button>
        </th>
      </tr>
    </thead>
    <tbody
      v-for="enemy in pageList"
      :key="enemy.sortId"
      class="el-enemy"
      :data-rank="enemy.rank"
    >
      <tr>
        <td class="el-c-avatar" :rowspan="enemy.abilityHtml ? 2 : 1">
          <a :href="enemy.href" tabindex="-1" aria-hidden="true">
            <EnemyAvatar :enemy="enemy" />
          </a>
        </td>
        <th scope="row" class="el-c-name" :rowspan="enemy.abilityHtml ? 2 : 1">
          <a class="el-name" :href="enemy.href">{{ enemy.name }}</a>
          <!-- 地位只画成色条，读屏另给一遍文字 -->
          <span v-if="enemy.rank !== 'normal'" class="ak-sr-only">
            {{ enemy.level }}
          </span>
        </th>
        <td>
          <span class="el-strong">{{ enemy.race }}</span>
          <span class="el-sub">{{ enemy.motion }}</span>
        </td>
        <td>
          <span>{{ enemy.attackType.join(" · ") }}</span>
          <span class="el-sub">{{ enemy.damageType.join(" · ") }}</span>
        </td>
        <td
          v-for="(col, i) in STAT_COLS"
          :key="col.key"
          :class="[
            'el-c-stat',
            { 'el-sep': i % 4 === 0, 'is-sorted': sortStat === col.key },
          ]"
        >
          <GradeValue :value="enemy.stats[col.key]" />
        </td>
      </tr>
      <tr v-if="enemy.abilityHtml">
        <!-- abilityHtml 是 convertAbility 转义后重新拼的，不是数据原文 -->
        <td
          :colspan="STAT_COLS.length + 2"
          class="el-ability"
          aria-label="能力"
          v-html="enemy.abilityHtml"
        />
      </tr>
    </tbody>
  </table>
</template>

<style scoped lang="scss">
@use "../mixins";

.el-table {
  table-layout: fixed;
  width: 100%;
  font-size: var(--ak-fs-sm);

  // 表头吸顶；Arknights 皮肤上吸在页眉下（别的皮肤没有吸顶的页眉）
  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 9px 8px;
    white-space: nowrap;
    letter-spacing: 0;
    text-transform: none;

    .skin-arknights & {
      top: var(--ak-header-h);
    }
  }

  th > .ak-table__sort:hover {
    color: var(--ak-accent);
  }

  td {
    border-bottom: 0;
    padding: 8px 8px 5px;
    vertical-align: top;
    line-height: 1.4;
  }

  :is(th, td).el-c-stat {
    text-align: center;
  }

  // 生存四项 / 其余四项各成一组
  :is(th, td).el-sep {
    border-left: 1px solid var(--ak-border);
  }

  td.el-c-stat {
    font-size: var(--ak-fs-body);
    line-height: 1.3;

    // 当前排序的那一列
    &.is-sorted {
      background: var(--ak-accent-subtle);
    }
  }

  tbody tr:hover td {
    background: none;
  }

  // 一个敌人 = 一个 tbody，悬停时两行一起亮
  tbody.el-enemy {
    @include mixins.rank-color;

    border-top: 1px solid var(--ak-border);

    > tr:first-child > :is(td, th) {
      padding-bottom: 9px;
    }

    // 能力行顶上一条弱线：比敌人之间的线弱一级
    > tr:last-child > td.el-ability {
      padding-top: 5px;
      padding-bottom: 9px;
      border-top: 1px solid var(--ak-border-subtle);
    }

    &:hover td {
      background: var(--ak-bg-hover);
    }

    &:hover td.el-c-stat.is-sorted {
      background: var(--ak-accent-muted);
    }

    th.el-c-name {
      padding: 8px 8px 9px;
      vertical-align: top;
      font-weight: 400;
      text-align: left;
      border-bottom: 0;
      line-height: 1.4;
    }
  }
}

// 头像列：精英 / 领袖在左缘出色条（同敌人卡的左边条）
.el-c-avatar {
  --el-avatar: 56px;

  box-shadow: inset 4px 0 0 var(--_rank, transparent);

  > a {
    display: block;
    width: var(--el-avatar);
    margin-left: 8px;
  }
}

.el-name {
  font-weight: 700;
  font-size: var(--ak-fs-body);
  line-height: 1.25;
  color: var(--ak-fg);
  text-decoration: none;
  overflow-wrap: anywhere;

  &:visited {
    color: var(--ak-fg);
  }

  &:hover {
    color: var(--ak-accent);
    text-decoration: underline;
  }
}

.el-sub {
  @include mixins.sub;
}

.el-strong {
  font-weight: 600;
}

.el-ability {
  @include mixins.ability;
}
</style>
