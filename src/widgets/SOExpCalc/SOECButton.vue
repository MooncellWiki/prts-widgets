<script setup lang="ts">
/** 「特勤经验计算」那一条按钮：点开计算器；读取中 / 失败时 index.vue 也用它占位 */
</script>

<template>
  <div class="soec-button">
    <i class="mdi mdi-rhombus-outline"></i>
    <slot>特勤经验计算</slot>
  </div>
</template>

<style scoped>
.soec-button {
  background: linear-gradient(180deg, black, #ab9834);
  padding: 0.3em;
  color: #fff;
  box-shadow: 0 3px 4px #0000004d;
  width: calc(100% - 0.6em);
  max-width: calc(800px - 0.6em);
  text-align: center;
  cursor: pointer;
}
</style>
