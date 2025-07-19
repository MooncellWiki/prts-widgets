<script setup lang="ts">
import { computed } from "vue";

import { NFlex, NInputNumber, NProgress } from "naive-ui";

const props = defineProps<{
  maxLevel: number;
  levelMaxExp: number;
  selectedElite: number;
}>();

const level = defineModel<number>("level", { required: true });
const exp = defineModel<number>("exp", { required: true });

const percentage = computed(() => (exp.value / props.levelMaxExp) * 100);

const handleLevelUpdate = (value: number | null) => {
  if (value !== null) {
    level.value = value;
  }
};

const handleExpUpdate = (value: number | null) => {
  if (value !== null) {
    exp.value = value;
  }
};
</script>

<template>
  <NFlex vertical align="center" :size="0">
    <div>
      <NProgress
        type="circle"
        status="warning"
        :percentage="percentage"
        :offset-degree="180"
        :border-radius="0"
        :fill-border-radius="0"
        class="mb-3"
      >
        <NFlex vertical align="center" :size="0">
          <NFlex justify="space-between">
            <span>LV</span>
            <span class="font-bold">/ {{ maxLevel }}</span>
          </NFlex>
          <NInputNumber
            v-model:value="level"
            :min="1"
            :max="maxLevel"
            :show-button="false"
            :keyboard="{ ArrowUp: true, ArrowDown: true }"
            class="pa-0 text-center"
            size="large"
            placeholder="1"
            @update:value="handleLevelUpdate"
          />
        </NFlex>
      </NProgress>
    </div>
    <div v-if="level !== maxLevel" class="text-center">
      <NInputNumber
        v-model:value="exp"
        :min="0"
        :max="levelMaxExp"
        class="w-12em text-center"
        :keyboard="{ ArrowUp: true, ArrowDown: true }"
        placeholder="1"
        button-placement="both"
        :disabled="level === maxLevel"
        @update:value="handleExpUpdate"
      >
        <template #suffix> / {{ levelMaxExp }} </template>
      </NInputNumber>
      [
      {{ ((exp / levelMaxExp) * 100).toFixed(2) }}% ]
    </div>
    <div v-else class="text-center">
      <NInputNumber
        placeholder="MAX"
        button-placement="both"
        :disabled="true"
        class="w-12em text-center"
      />
      <slot>[ ---% ] </slot>
    </div>
  </NFlex>
</template>
