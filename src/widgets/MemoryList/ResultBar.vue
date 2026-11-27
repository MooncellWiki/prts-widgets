<script setup lang="ts">
/** 结果计数：同干员一览的「共 N 位干员」/「M / N 位干员」，这里换成密录条数 */
defineProps<{
  shown: number;
  total: number;
}>();
</script>

<template>
  <div class="ml-bar">
    <span class="ml-bar__count" role="status">
      <template v-if="shown === total">
        共 <b>{{ total }}</b> 条密录
      </template>
      <template v-else>
        <b>{{ shown }}</b> / {{ total }} 条密录
      </template>
    </span>
  </div>
</template>

<style scoped lang="scss">
.ml-bar {
  display: flex;
  align-items: center;
  min-height: 32px;
  margin: 0 0 var(--ak-space-3);
}

.ml-bar__count {
  font-size: var(--ak-fs-sm);
  color: var(--ak-fg-muted);
  white-space: nowrap;

  b {
    font: 700 var(--ak-fs-h3)/1 var(--ak-font-label);
    color: var(--ak-fg);
    font-variant-numeric: tabular-nums;
    margin-right: 2px;
  }
}
</style>
