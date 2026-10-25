<script setup lang="ts">
import { computed } from "vue";

import { AkOpCard } from "@mooncellwiki/prts-design-vue";

import { avatar } from "@/utils/charImage";

import { professionLine, rarityIcon, wikiLink } from "../assets";
import { condText, professionName } from "../consts";

import type { Char, Holding } from "../data";

/**
 * 干员头像 = 设计系统的干员卡（同首页「亮点干员」：纯头像、不出名字栏；角标同现网 微件:干员头像——职业左上、星级右下）。
 * 精英图标不叠在卡上（64px 的卡叠三枚角标把脸盖掉一半），解锁条件写在行里；
 * 悬停 / 聚焦出「名字 · 稀有度 职业 · 解锁条件」（data-tip，气泡由根组件画；卡自带的 title 清掉，免得出两层提示）。
 */
const props = defineProps<{
  char: Char;
  /** 技能视图的持有者：提示里带解锁条件 */
  holding?: Holding;
  /** 不符合持有者那三行筛选：压淡，不藏 */
  dim?: boolean;
  /** 卡头里的头像：名字就在旁边，不进 Tab 次序、读屏跳过 */
  decorative?: boolean;
}>();

/** AkOpCard 的 rarity 是 1–6 的字面量类型 */
const rarity = computed(() => props.char.stars as 1 | 2 | 3 | 4 | 5 | 6);
const tip = computed(() => {
  const { char, holding } = props;
  const parts = [
    char.name,
    `${char.stars}★ ${professionName(char.profession)}`,
  ];
  if (holding) parts.push(condText(holding.phase, holding.level));
  return parts.join(" · ");
});
</script>

<template>
  <AkOpCard
    :class="['rs-holder', { 'is-dim': dim }]"
    :name="char.name"
    :avatar="avatar({ zh: char.name, charId: char.id })"
    :rarity="rarity"
    :rarity-icon="rarityIcon(char.stars)"
    :profession="professionName(char.profession)"
    :profession-icon="professionLine(char.profession)"
    size="sm"
    :href="wikiLink(char.name)"
    avatar-only
    title=""
    :data-tip="decorative ? undefined : tip"
    :tabindex="decorative ? -1 : undefined"
    :aria-hidden="decorative ? 'true' : undefined"
  />
</template>

<style scoped lang="scss">
// 宽 64（现网头像 60），角标按卡宽等比收：职业 18px 黑框 / 15px 图，星级 12px 高；结果区窄时收到 56
.rs-holder.ak-op-card {
  --_w: 64px;

  flex: none;

  .rs--compact & {
    --_w: 56px;
  }

  :deep(.ak-op-card__rarity) {
    height: 12px;
  }

  :deep(.ak-op-card__prof) {
    width: 18px;
    height: 18px;

    > img {
      width: 15px;
      height: 15px;
    }
  }

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: -2px;
  }

  &.is-dim {
    opacity: 0.3;

    &:hover,
    &:focus-visible {
      opacity: 1;
    }
  }
}
</style>
