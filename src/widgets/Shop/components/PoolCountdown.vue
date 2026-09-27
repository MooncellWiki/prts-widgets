<script setup lang="ts">
import { computed } from "vue";

import { useIntervalFn, useNow } from "@vueuse/core";

import { formatRemaining, wikiLink } from "../utils";

// 对应原模板里的 {{倒计时/CN|event=[[卡池一览#…|…]]更换|ed=刷新|…}}
const props = defineProps<{
  pool: string;
  anchor: string;
  /** 秒级时间戳，商店商品的 goodEndTime + 1，即卡池更换时刻 */
  end: number;
}>();

// 只显示到分钟，半分钟刷新一次足够
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 30_000) });
const remaining = computed(() =>
  Math.floor(props.end - now.value.getTime() / 1000),
);
</script>

<template>
  <li>
    <template v-if="remaining > 0">
      现在距<a :href="wikiLink('卡池一览', anchor)">{{ pool }}</a
      >更换还有{{ formatRemaining(remaining) }}
    </template>
    <template v-else>
      <a :href="wikiLink('卡池一览', anchor)">{{ pool }}</a
      >已更换，等待商店数据刷新
    </template>
  </li>
</template>
