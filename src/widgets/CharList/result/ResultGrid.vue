<script setup lang="ts">
import { AkOpCard, AkOpGrid, type Rarity } from "@mooncellwiki/prts-design-vue";
import { storeToRefs } from "pinia";

import { avatar, halfPortrait, professionBadge, wikiLink } from "../assets";
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
  <AkOpGrid :class="['ol-grid', half ? 'ol-grid--half' : 'ol-grid--avatar']">
    <AkOpCard
      v-for="char in pageList"
      :key="char.sortId"
      :name="char.zh"
      :sub="half ? char.en : undefined"
      :avatar="half ? halfPortrait(char.zh) : avatar(char.zh)"
      :rarity="(char.rarity + 1) as Rarity"
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
