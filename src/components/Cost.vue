<script setup lang="ts">
import { professionMap, sum } from "@/utils/utils";

import Avatar from "./Avatar.vue";

export interface CostProps {
  rarity: number;
  name: string;
  profession: keyof typeof professionMap;
  elite: number; // 精英化
  skill: number; // 技能1-7
  mastery: [number, number, number]; // 技能专精
  uniequip: number; // 模组
}
defineProps<{
  rarity: number;
  name?: string;
  profession: keyof typeof professionMap;
  elite: number; // 精英化
  skill: number; // 技能1-7
  mastery: [number, number, number]; // 技能专精
  uniequip: number; // 模组
}>();
</script>

<template>
  <div class="my-8px flex flex-col items-center justify-center">
    <Avatar
      :name="name"
      :rarity="rarity - 1"
      :profession="professionMap[profession]"
      size="sm"
    />
    <div :class="{ 'text-disabled': elite === 0 }">
      精英化：
      <span :class="{ 'text-primary-main': elite !== 0 }" class="font-bold">
        {{ elite }}
      </span>
    </div>
    <div :class="{ 'text-disabled': skill === 0 }">
      技能1→7：
      <span :class="{ 'text-primary-main': skill !== 0 }" class="font-bold">
        {{ skill }}
      </span>
    </div>
    <div v-if="mastery" :class="{ 'text-disabled': sum(mastery) === 0 }">
      技能专精：
      <span
        :class="{ 'text-primary-main': sum(mastery) !== 0 }"
        class="font-bold"
      >
        {{ sum(mastery) === 0 ? 0 : mastery.join("/") }}
      </span>
    </div>
    <div :class="{ 'text-disabled': uniequip === 0 }">
      模组：
      <span :class="{ 'text-primary-main': uniequip !== 0 }" class="font-bold">
        {{ uniequip }}
      </span>
    </div>
  </div>
</template>
