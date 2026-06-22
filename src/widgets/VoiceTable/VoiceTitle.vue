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
          class="voice-title-tip"
          role="img"
          tabindex="0"
          aria-label="显示时间说明"
          >?</span
        >
      </template>
      {{ tip }}
    </NTooltip>
  </span>
</template>

<style scoped>
.voice-title {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25em;
}

.voice-title-tip {
  display: inline-flex;
  width: 1em;
  height: 1em;
  align-items: center;
  justify-content: center;
  border: 1px solid #36c;
  border-radius: 50%;
  color: #36c;
  cursor: help;
  font-size: 0.85em;
  font-weight: 700;
  line-height: 1;
}

.voice-title-tip:focus-visible {
  outline: 2px solid #36c;
  outline-offset: 2px;
}
</style>
