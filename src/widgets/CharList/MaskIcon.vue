<script setup lang="ts">
/**
 * 职业 / 分支图标：游戏筛选面板用的白线稿当 CSS 遮罩，颜色取 currentColor——
 * 选中 / 悬停 / 明暗主题都跟文字走，不用切图（游戏里同理：一张白图用 Image.color 着色）。
 */
defineProps<{ src: string }>();
</script>

<template>
  <i
    class="ol-ico"
    :style="{ maskImage: `url(&quot;${src}&quot;)` }"
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.ol-ico {
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: center / contain no-repeat;
  mask: center / contain no-repeat;
}
</style>
