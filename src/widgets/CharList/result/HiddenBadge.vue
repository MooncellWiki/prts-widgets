<script setup lang="ts">
/**
 * 「隐藏势力」标志：这位干员是靠 ingameFaction.hidden 里的项才通过作战势力筛选的（见 hiddenOnlyMatch）。
 * 表格里接在势力字符串后面写全称，卡片角上只写「隐藏」，所以文字由调用处给。
 */
defineProps<{ label: string }>();
</script>

<template>
  <span class="ol-hidden">{{ label }}</span>
</template>

<style scoped lang="scss">
// 紫底白字：结果里的一处提醒，不是筛选项，所以不做成芯片的样子
.ol-hidden {
  display: inline-block;
  padding: 0 4px;
  background: var(--ak-purple-400, #a76ee5);
  color: #fff;
  font-size: var(--ak-fs-xs);
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
}
</style>
