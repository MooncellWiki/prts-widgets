<script setup lang="ts">
import { AkRarity, type Rarity } from "@mooncellwiki/prts-design-vue";

import { wikiLink } from "../assets";

import type { Char } from "../utils";

/** 干员的身份：名称（链到干员页）+ 英文 / 日文名 +（插槽）+ 星级 · 代号 */
defineProps<{ char: Char }>();

defineSlots<{
  /** 名字与代号之间的一行（卡片里放分支 · 位置） */
  default?: () => unknown;
}>();
</script>

<template>
  <a class="ol-name" :href="wikiLink(char.zh)">{{ char.zh }}</a>
  <span class="ol-sub" lang="en">
    {{ char.en
    }}<template v-if="char.ja && char.ja !== char.en">
      · <span lang="ja">{{ char.ja }}</span>
    </template>
  </span>
  <slot />
  <span class="ol-sub ol-sub--id" :data-rarity="char.rarity + 1">
    <AkRarity :value="(char.rarity + 1) as Rarity" />{{ char.id }}
  </span>
</template>
