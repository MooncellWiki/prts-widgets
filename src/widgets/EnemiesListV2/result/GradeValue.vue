<script setup lang="ts">
/**
 * 一项属性的等级。不另配颜色，只分轻重：S 档最重，往下一档比一档淡，一列扫下去先看到高的；
 * ?（游戏里隐藏数值的敌人）最淡。
 */
defineProps<{ value: string }>();

const tier = (grade: string) =>
  ({ S: "s", A: "a", B: "b" })[grade[0]] ?? (grade === "?" ? "none" : "low");
</script>

<template>
  <span class="el-grade" :data-tier="tier(value)">{{ value }}</span>
</template>

<style scoped lang="scss">
.el-grade {
  font-family: var(--ak-font-label);
  font-weight: 600;
  color: var(--ak-fg-muted);

  &[data-tier="s"] {
    font-weight: 700;
    color: var(--ak-fg);
  }

  &[data-tier="a"] {
    color: var(--ak-fg);
  }

  &[data-tier="b"] {
    color: var(--ak-fg-secondary);
  }

  &[data-tier="none"] {
    font-weight: 400;
    color: var(--ak-fg-subtle);
  }
}
</style>
