<template>
  <!-- 一组筛选行：标签列随本组最长的标签定宽，各行对齐 -->
  <div class="ol-rows"><slot /></div>
</template>

<style scoped lang="scss">
.ol-rows {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);

  .ol--narrow & {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
