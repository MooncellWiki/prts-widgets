<script setup lang="ts">
import { storeToRefs } from "pinia";

import MaskIcon from "../MaskIcon.vue";
import { branchLine } from "../assets";
import { STAT_COLS, type SortKey } from "../consts";
import { useCharListStore } from "../store";

import OpAvatar from "./OpAvatar.vue";
import OpIdent from "./OpIdent.vue";
import StatValue from "./StatValue.vue";

/**
 * 结果 · 表格。一位干员 = 一个 <tbody> 两行：
 * 上行是身份 + 八项数值各占一列（等宽数字右对齐，点表头排序）+ 势力 + 标签；下行是特性全文 + 获取方式。
 * 结果区窄于 1000 时放不下八列四位数，换成 ResultCards。
 */
const store = useCharListStore();
const { state, statsOf } = store;
const { pageList, sortStat } = storeToRefs(store);

const ariaSort = (key: SortKey) =>
  state.sort.key === key
    ? state.sort.dir > 0
      ? "ascending"
      : "descending"
    : undefined;
</script>

<template>
  <table class="ak-table ol-table">
    <colgroup>
      <col style="width: 64px" />
      <col style="width: 16%" />
      <col style="width: 10.5%" />
      <col v-for="col in STAT_COLS" :key="col.key" style="width: 5.1%" />
      <col style="width: 15%" />
      <col />
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
            干员
          </button>
        </th>
        <th scope="col">分支 / 特性</th>
        <th
          v-for="(col, i) in STAT_COLS"
          :key="col.key"
          scope="col"
          :class="['num', { 'ol-sep': i % 4 === 0 }]"
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
        <th scope="col" class="ol-sep">势力 / 获取</th>
        <th scope="col">标签</th>
      </tr>
    </thead>
    <tbody v-for="char in pageList" :key="char.sortId" class="ol-op">
      <tr>
        <td class="ol-c-avatar" rowspan="2"><OpAvatar :char="char" /></td>
        <th scope="row" class="ol-c-name" rowspan="2">
          <OpIdent :char="char" />
        </th>
        <td>
          <span class="ol-branchname">
            <MaskIcon :src="branchLine(char.subProfession)" />
            <span class="ol-strong">{{ char.subProfession }}</span>
          </span>
          <span class="ol-sub">
            {{ [char.position, char.sex].filter(Boolean).join(" · ") }}
          </span>
        </td>
        <td
          v-for="(col, i) in STAT_COLS"
          :key="col.key"
          :class="[
            'num',
            {
              'ol-sep': i % 4 === 0,
              'is-mod': statsOf(char).mod[col.key],
              'is-sorted': sortStat === col.key,
            },
          ]"
        >
          <StatValue :value="statsOf(char)[col.key]" />
        </td>
        <td class="ol-sep">
          {{ char.force.join(" · ") }}
          <span class="ol-sub">
            {{
              [char.birthPlace, char.race.join(" / ")]
                .filter(Boolean)
                .join(" · ")
            }}
          </span>
        </td>
        <td class="ol-c-tags">
          <span v-if="char.tag.length > 0" class="ak-tags">
            <span
              v-for="tag in char.tag"
              :key="tag"
              class="ak-tag ak-tag--sm ak-tag--outline"
            >
              {{ tag }}
            </span>
          </span>
        </td>
      </tr>
      <tr>
        <!-- featureHtml 是 convertFeature 转义后重新拼的，不是模板原文 -->
        <td
          colspan="9"
          class="ol-feature"
          aria-label="特性"
          v-html="char.featureHtml"
        />
        <td colspan="2" class="ol-obtain ol-sep" aria-label="获取方式">
          {{ char.obtainMethod.join(" · ") }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
