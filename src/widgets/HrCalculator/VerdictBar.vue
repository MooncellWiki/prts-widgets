<script setup lang="ts">
import { AkButton, useToast } from "@mooncellwiki/prts-design-vue";

import { useRecruit } from "./store";
import { writeQuery } from "./url";

/** 标签面板与结果之间的一行：左边图例（限 / 单选保底方块），右边「清空」（下一个招募位从头选）与「复制分享链接」 */
const recruit = useRecruit();
const { state } = recruit;
const toast = useToast();

async function copyLink() {
  const url = `${location.origin}${location.pathname}${writeQuery(
    location.search,
    state.sel,
  )}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success(decodeURIComponent(url), { title: "链接已复制" });
  } catch {
    toast.error(decodeURIComponent(url), { title: "复制失败，请手动复制" });
  }
}
</script>

<template>
  <div class="hr-bar">
    <div class="hr-legend">
      <span><span class="hr-legend__only">限</span>只能通过公开招募获得</span>
      <span data-rarity="4">
        <i />单选这一个标签即可保底（方块颜色 = 保底的稀有度）
      </span>
    </div>
    <div class="hr-bar__tools">
      <AkButton
        size="sm"
        icon="refresh"
        :disabled="state.sel.size === 0"
        @click="recruit.clear()"
      >
        清空
      </AkButton>
      <AkButton size="sm" icon="link" @click="copyLink">复制分享链接</AkButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "./mixins";

.hr-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: var(--ak-space-4) 0 var(--ak-space-3);
  min-height: 32px;

  &__tools {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;

    .hr--narrow & {
      margin-left: 0;
    }
  }

  :deep(.ak-icon) {
    width: 14px;
    height: 14px;
  }
}

.hr-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-muted);

  > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  &__only {
    @include mixins.only-badge;
  }

  i {
    width: 7px;
    height: 7px;
    background: var(--ak-r);
  }
}
</style>
