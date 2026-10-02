<script setup lang="ts">
import { computed } from "vue";

import {
  AkButton,
  AkEmpty,
  AkHeading,
  AkSpinner,
} from "@mooncellwiki/prts-design-vue";

import ComboTier from "./ComboTier.vue";
import { useRecruit } from "./store";

/**
 * 结果：按「保底几星」分层——保底 6★ / 5★ / 4★ 各一层，整组都是 1★ 的单列「必得支援机械」，
 * 保底 3★ 及以下的收在最后一层「不保底」，前面有保底层时默认收起。
 * 一个标签都没选时是保底速查：全部能保底 4★ 以上的最小组合，排成多列的格子。
 */
defineProps<{
  /** 干员数据没取到 */
  failed?: boolean;
}>();

const recruit = useRecruit();
const { ops, state, result, reference } = recruit;

const refTiers = computed(() =>
  [5, 4]
    .map((min) => ({
      min,
      combos: reference.value.filter((c) => c.min === min),
    }))
    .filter((t) => t.combos.length > 0),
);
const lowMin = computed(() => Math.min(...result.value.low.map((c) => c.min)));

const reload = () => location.reload();
</script>

<template>
  <div class="hr-result">
    <AkEmpty v-if="failed" title="干员数据读取失败">
      <AkButton variant="link" @click="reload">刷新页面</AkButton>再试一次。
    </AkEmpty>

    <!-- 外壳预渲染与数据还没回来时 -->
    <AkSpinner v-else-if="ops.length === 0" description="正在读取干员数据…" />

    <template v-else-if="state.sel.size === 0">
      <AkHeading
        class="hr-ref-head"
        variant="underline"
        title="保底速查"
        en="Guarantees"
      >
        <template #extra>时限 9:00 · 共 {{ reference.length }} 组</template>
      </AkHeading>
      <ComboTier
        v-for="t in refTiers"
        :key="t.min"
        :rarity="t.min"
        :title="`保底 ${t.min}★`"
        :combos="t.combos"
        :level="3"
        grid
      />
    </template>

    <AkEmpty v-else-if="result.list.length === 0" title="没有可能出现的干员">
      换一档招募时限，或者<AkButton variant="link" @click="recruit.clear()">
        清空标签</AkButton
      >。
    </AkEmpty>

    <template v-else>
      <ComboTier
        v-for="t in result.tiers"
        :key="t.min"
        :rarity="t.min"
        :title="`保底 ${t.min}★`"
        :combos="t.combos"
      />
      <ComboTier
        v-if="result.robots.length"
        :rarity="1"
        title="必得支援机械"
        :combos="result.robots"
      />
      <ComboTier
        v-if="result.low.length"
        v-model:open="state.lowOpen"
        :rarity="lowMin"
        title="不保底"
        :count="`${result.low.length} 组 · 最低可能出 ${lowMin}★`"
        :combos="result.low"
        :collapsible="result.tiers.length > 0 || result.robots.length > 0"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.hr-ref-head {
  margin-bottom: var(--ak-space-3);
}
</style>
