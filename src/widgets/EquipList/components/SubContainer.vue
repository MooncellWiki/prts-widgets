<script setup lang="ts">
import { computed } from "vue";

import {
  AkButton,
  AkButtonGroup,
  AkPanel,
  AkProfession,
} from "@mooncellwiki/prts-design-vue";

import { getLanguage } from "@/utils/i18n";

import { branchLine } from "../../CharList/assets";
import { useEquipListStore } from "../store";

import SubAvatar from "./SubAvatar.vue";

import type { CharEquips } from "../types";

const props = withDefaults(
  defineProps<{
    title: string;
    chars?: CharEquips[];
    groupby?: string;
  }>(),
  {
    chars: () => [],
    groupby: () => "sub",
  },
);

const store = useEquipListStore();
const locale = getLanguage();

const date = computed(() => {
  const value = new Date(Number(props.title) * 1000);
  // 旧数据里可能是非数字 / 空标题；时间行也别让卡片整个挂掉
  return Number.isNaN(value.getTime()) ? new Date(0) : value;
});
const dateText = computed(() => date.value.toLocaleDateString(locale));
const dateTime = computed(() => date.value.toISOString());
</script>

<template>
  <AkPanel :class="['el-sub', `el-sub--${groupby}`]">
    <template #header>
      <span class="el-sub__head">
        <template v-if="groupby === 'sub'">
          <AkProfession :src="branchLine(title)" :name="title" branch />
          <span class="el-sub__title">{{ title }}</span>
        </template>

        <template v-else-if="groupby === 'time'">
          <time class="el-sub__title" :datetime="dateTime">{{ dateText }}</time>
        </template>

        <template v-else>
          <a class="el-sub__link" :href="`/w/${title}`">{{ title }}</a>
        </template>
      </span>
    </template>

    <template #header-extra>
      <span class="el-sub__tools">
        <AkButtonGroup size="sm" label="展开或收起本组模组">
          <AkButton
            class="el-sub__expand"
            variant="ghost"
            @click="store.expand(chars)"
          >
            展开
          </AkButton>
          <AkButton
            class="el-sub__collapse"
            variant="ghost"
            @click="store.collapse(chars)"
          >
            收起
          </AkButton>
        </AkButtonGroup>
      </span>
    </template>

    <div class="el-sub__body">
      <SubAvatar
        v-for="(char, ind) in chars"
        :key="ind"
        :show="store.isShown(char)"
        :char="char"
      />
    </div>
  </AkPanel>
</template>

<style scoped lang="scss">
.el-sub {
  margin: 0 0 var(--ak-space-3);

  :deep(.ak-panel__body) {
    padding: 0;
  }

  :deep(.ak-panel__title) {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  &__head-icon {
    flex: none;
    color: var(--ak-fg-muted);
  }

  &__title {
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  &__link {
    color: var(--ak-link);
    text-decoration: none;

    &:hover {
      color: var(--ak-link-hover);
      text-decoration: underline;
    }
  }

  &__tools {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  &__body {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    padding: 6px;
    background: var(--ak-bg-surface);
  }
}
</style>
