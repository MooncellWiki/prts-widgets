<script setup lang="ts">
import { AkRarity } from "@mooncellwiki/prts-design-vue";

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
  <span class="ol-sub ol-sub--id" :data-rarity="char.stars">
    <AkRarity :value="char.stars" />{{ char.id }}
  </span>
</template>

<style scoped lang="scss">
@use "../text";

.ol-name {
  font-weight: 700;
  font-size: var(--ak-fs-body);
  line-height: 1.25;
  color: var(--ak-fg);
  text-decoration: none;

  &:visited {
    color: var(--ak-fg);
  }

  &:hover {
    color: var(--ak-accent);
    text-decoration: underline;
  }
}

.ol-sub {
  @include text.sub;

  &--id {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    font: 600 var(--ak-fs-overline) / 1.2 var(--ak-font-label);
    letter-spacing: 0.04em;
    color: var(--ak-fg-subtle);

    .ak-rarity {
      --_c: var(--ak-r-text);

      font-size: 9px;
    }
  }
}
</style>
