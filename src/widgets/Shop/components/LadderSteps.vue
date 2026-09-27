<script setup lang="ts">
import { wikiItemName } from "../utils";

import ContractIcon from "./ContractIcon.vue";
import ItemIcon from "./ItemIcon.vue";
import ShopCard from "./ShopCard.vue";

import type { CharInfo, ProgressStep } from "../types";

// 阶梯商品逐档展示，档位角标 [n] 同原页面的「兑换阶梯表」
withDefaults(
  defineProps<{
    steps: ProgressStep[];
    chars: Map<string, CharInfo>;
    size?: number;
  }>(),
  { size: 40 },
);
</script>

<template>
  <div class="ladder-steps">
    <ShopCard
      v-for="step in steps"
      :key="step.order"
      :price="step.price"
      width="auto"
    >
      <span class="ladder-steps-icon">
        <sup class="ladder-steps-order">[{{ step.order }}]</sup>
        <ContractIcon
          v-if="step.item.type === 'CHAR'"
          :name="chars.get(step.item.id)?.name ?? step.displayName"
          :rarity="chars.get(step.item.id)?.rarity ?? 4"
          :size="size"
        />
        <ItemIcon
          v-else
          :name="wikiItemName(step.item, step.displayName)"
          :count="step.item.count > 1 ? step.item.count : undefined"
          :size="size"
        />
      </span>
    </ShopCard>
  </div>
</template>

<style scoped>
.ladder-steps {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
}

.ladder-steps-icon {
  display: inline-flex;
  align-items: flex-start;
  padding: 0 0.4em;
}

.ladder-steps-order {
  margin-right: 2px;
  line-height: 1;
}
</style>
