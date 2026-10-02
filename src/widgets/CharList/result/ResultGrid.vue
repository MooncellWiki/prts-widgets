<script setup lang="ts">
import { AkOpCard, AkOpGrid } from "@mooncellwiki/prts-design-vue";
import { storeToRefs } from "pinia";

import { avatar, halfPortrait, onImageError } from "@/utils/charImage";

import { professionBadge, wikiLink } from "../assets";
import { useCharListStore } from "../store";

import StatValue from "./StatValue.vue";

/**
 * 结果 · 半身像 / 头像：干员卡网格。
 * 按数值排序时卡片角上带出那项数值（游戏干员列表同款），不然在这两种视图里看不出排的是什么。
 */
defineProps<{
  /** 半身像（竖 1 : 2，带英文名）；否则是头像小卡 */
  half?: boolean;
}>();

const store = useCharListStore();
const { statsOf } = store;
const { pageList, sortStat } = storeToRefs(store);
</script>

<template>
  <AkOpGrid
    :class="['ol-grid', half ? 'ol-grid--half' : 'ol-grid--avatar']"
    @error.capture="onImageError"
  >
    <AkOpCard
      v-for="char in pageList"
      :key="char.sortId"
      :name="char.zh"
      :sub="half ? char.en : undefined"
      :avatar="half ? halfPortrait(char) : avatar(char)"
      :rarity="char.stars"
      :profession="char.profession"
      :profession-icon="professionBadge(char.profession)"
      :size="half ? 'md' : 'sm'"
      :href="wikiLink(char.zh)"
    >
      <template v-if="sortStat" #badge>
        <span class="ol-sortinfo">
          <StatValue :value="statsOf(char)[sortStat]" />
        </span>
      </template>
    </AkOpCard>
  </AkOpGrid>
</template>

<style scoped lang="scss">
// .ol-grid 是 AkOpGrid 的根；卡片里面的结构在 AkOpCard 里，要用 :deep
.ol-grid {
  &--half {
    grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));

    :deep(.ak-op-card__portrait) {
      aspect-ratio: 1 / 2;

      > img {
        object-position: 50% 0;
      }
    }

    .ol--narrow & {
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      gap: var(--ak-space-2);
    }
  }

  &--avatar {
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: var(--ak-space-2);

    .ol--narrow & {
      grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    }
  }

  // 名字显示全：放不下就折行，不截断（同一行的卡片等高，短名字下面留白）
  :deep(.ak-op-card) {
    display: flex;
    flex-direction: column;
  }

  :deep(.ak-op-card__name) {
    flex: 1;
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: anywhere;
  }

  :deep(.ak-op-card__prof) {
    width: 22px;
    height: 22px;

    > img {
      width: 18px;
      height: 18px;
    }
  }

  // 排序数值放右下角：右上角会压住六颗星
  :deep(.ak-op-card__badge) {
    top: auto;
    right: 0;
    bottom: 0;
  }
}

// 按数值排序时卡片角上带出那项数值（游戏干员列表的 dyn_char_sort_info_item：#0098DC 底白字）
.ol-sortinfo {
  display: block;
  padding: 2px 5px;
  background: var(--ak-blue-500, #0098dc);
  color: #fff;
  font: 700 var(--ak-fs-xs) / 1.2 var(--ak-font-label);
  font-variant-numeric: tabular-nums;

  :deep(small) {
    font-size: 0.8em;
    font-weight: 400;
  }
}
</style>
