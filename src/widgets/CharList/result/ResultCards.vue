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

<style scoped lang="scss">
@use "../text";

.ol-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--ak-space-2);
}

.ol-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);
  border-top: 3px solid var(--ak-r, var(--ak-border-strong));

  &__head {
    display: flex;
    gap: 10px;
    min-width: 0;
  }

  &__id {
    flex: 1;
    min-width: 0;

    // 英文名 / 分支那几行小字：一行放不下就截断（OpIdent 里面的也算，所以 :deep）
    :deep(.ol-sub) {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  // 八项数值摊开成 4 × 2 的格
  &__stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    margin: 0;
    background: var(--ak-border);
    border: 1px solid var(--ak-border);

    > div {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 5px 6px;
      background: var(--ak-bg-surface);

      &.is-sorted {
        background: var(--ak-accent-subtle);
      }
    }

    dt {
      font-size: 10px;
      line-height: 1;
      font-weight: 500;
      color: var(--ak-fg-muted);
    }

    dd {
      margin: 0;
      font: 700 var(--ak-fs-sm) / 1 var(--ak-font-label);
      font-variant-numeric: tabular-nums;

      &.is-mod {
        color: var(--ak-accent);
      }

      :deep(small) {
        font-size: 0.78em;
        font-weight: 400;
        color: var(--ak-fg-muted);
      }
    }
  }

  p {
    margin: 0;
  }

  .ak-tags {
    gap: 4px;
  }
}

.ol-sub {
  @include text.sub;
}

.ol-feature {
  @include text.feature;
}

.ol-obtain {
  @include text.obtain;
}
</style>
