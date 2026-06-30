<script setup lang="ts">
import { computed } from "vue";

import { NTooltip } from "naive-ui";

const props = defineProps<{
  title?: string;
}>();

const displayTips: Record<string, string> = {
  新年祝福: "游戏内仅在每年1月1日-1月4日显示",
  生日: "游戏内仅在每年博士生日显示",
  周年庆典: "游戏内仅在每年5月1日-5月4日显示",
};

const tip = computed(() => (props.title ? displayTips[props.title] : ""));
</script>

<template>
  <span class="voice-title">
    <span>{{ title }}</span>
    <NTooltip v-if="tip" trigger="hover">
      <template #trigger>
        <span
          class="voice-title-tip mdi mdi-help-circle-outline color-[var(--darkblue)]"
          role="img"
          tabindex="0"
          aria-label="显示时间说明"
        />
      </template>
      {{ tip }}
    </NTooltip>
  </span>
</template>

<style scoped lang="scss">
.voice-title {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
