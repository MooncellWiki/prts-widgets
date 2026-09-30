<script setup lang="ts">
import { storeToRefs } from "pinia";

import { STAT_COLS } from "../consts";
import { useCharListStore } from "../store";

import OpAvatar from "./OpAvatar.vue";
import OpIdent from "./OpIdent.vue";
import StatValue from "./StatValue.vue";

import type { Char } from "../utils";

/** 结果 · 卡片：结果区窄于 1000（平板 / 手机）时代替表格，八项数值直接摊开成 4 × 2 的格 */
const store = useCharListStore();
const { statsOf } = store;
const { pageList, sortStat } = storeToRefs(store);

const origin = (char: Char) =>
  [char.force.join(" · "), char.birthPlace, char.race.join(" / ")]
    .filter(Boolean)
    .join(" · ");
</script>

<template>
  <div class="ol-cards">
    <article
      v-for="char in pageList"
      :key="char.sortId"
      class="ol-card"
      :data-rarity="char.rarity + 1"
    >
      <div class="ol-card__head">
        <OpAvatar :char="char" />
        <div class="ol-card__id">
          <OpIdent :char="char">
            <span class="ol-sub">
              {{
                [char.subProfession, char.position, char.sex]
                  .filter(Boolean)
                  .join(" · ")
              }}
            </span>
          </OpIdent>
        </div>
      </div>
      <span v-if="char.tag.length > 0" class="ak-tags">
        <span
          v-for="tag in char.tag"
          :key="tag"
          class="ak-tag ak-tag--sm ak-tag--outline"
        >
          {{ tag }}
        </span>
      </span>
      <dl class="ol-card__stats">
        <div
          v-for="col in STAT_COLS"
          :key="col.key"
          :class="{ 'is-sorted': sortStat === col.key }"
        >
          <dt>{{ col.short }}</dt>
          <dd :class="{ 'is-mod': statsOf(char).mod[col.key] }">
            <StatValue :value="statsOf(char)[col.key]" />
          </dd>
        </div>
      </dl>
      <!-- featureHtml 是 convertFeature 转义后重新拼的，不是模板原文 -->
      <p class="ol-feature" v-html="char.featureHtml" />
      <p class="ol-obtain">
        {{ origin(char) }}
        <template v-if="char.obtainMethod.length > 0">
          <br />{{ char.obtainMethod.join(" · ") }}
        </template>
      </p>
    </article>
  </div>
</template>
