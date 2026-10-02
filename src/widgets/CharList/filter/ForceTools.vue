<script setup lang="ts">
import {
  AkRadioButton,
  AkRadioGroup,
  AkSwitch,
} from "@mooncellwiki/prts-design-vue";

import { useCharListStore } from "../store";

import type { FilterState } from "../filter";

/**
 * 「势力」行的查询工具条，摆在选项芯片上一行：
 *   档案 / 作战——档案按模板给的 nation / group / team 查，作战改查游戏内的 ingameFaction（见 filters.ts）；
 *   隐藏势力——只在作战模式有意义，档案模式下不出这个开关；
 *   并选 / 同时——选中的势力命中一个就算符合，还是必须全中。
 * 三样都进地址栏（_fm / _fh，以及 force 参数的前缀，见 hash.ts）。
 */
defineProps<{ filter: FilterState }>();

const store = useCharListStore();
</script>

<template>
  <div class="ol-tools">
    <!-- <span class="ol-tools__name">模式</span> -->
    <AkRadioGroup
      :model-value="filter.selection.combat ? 'combat' : 'archive'"
      size="sm"
      label="势力查询方式"
      @update:model-value="store.setCombat(filter, $event === 'combat')"
    >
      <AkRadioButton value="archive">档案</AkRadioButton>
      <AkRadioButton value="combat">作战</AkRadioButton>
    </AkRadioGroup>

    <!-- <span class="ol-tools__name">匹配方式</span> -->
    <AkRadioGroup
      :model-value="filter.selection.and ? 'and' : 'or'"
      size="sm"
      label="势力匹配方式"
      @update:model-value="store.setAnd(filter, $event === 'and')"
    >
      <AkRadioButton value="or">并选</AkRadioButton>
      <AkRadioButton value="and">同时</AkRadioButton>
    </AkRadioGroup>

    <AkSwitch
      v-if="filter.selection.combat"
      :model-value="filter.selection.hidden"
      size="sm"
      @update:model-value="store.setHidden(filter, $event)"
    >
      隐藏势力
    </AkSwitch>
  </div>
</template>

<style scoped lang="scss">
// 占满一行，芯片从下一行接着排（.ol-row__opts 是 flex-wrap 容器）
.ol-tools {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  font-size: var(--ak-fs-xs);

  &__name {
    font-weight: 600;
    color: var(--ak-fg-muted);
    white-space: nowrap;
  }

  .ak-switch {
    font-weight: 500;
  }

  .ak-btn {
    min-width: 52px;
    justify-content: center;
  }
}
</style>
