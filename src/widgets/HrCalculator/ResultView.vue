<script setup lang="ts">
import { AkButton, AkEmpty, AkSpinner } from "@mooncellwiki/prts-design-vue";

import ComboItem from "./ComboItem.vue";
import { useRecruit } from "./store";

/**
 * 结果：全部组合排在同一张表里，保底高的在前（同保底标签少的在前、干员少的在前），整组都是 1★ 的支援机械排在最后。
 * 一个标签都没选时不出东西。
 */
defineProps<{
  /** 干员数据没取到 */
  failed?: boolean;
}>();

const recruit = useRecruit();
const { ops, state, result } = recruit;

const reload = () => location.reload();
</script>

<template>
  <div class="hr-result">
    <AkEmpty v-if="failed" title="干员数据读取失败">
      <AkButton variant="link" @click="reload">刷新页面</AkButton>再试一次。
    </AkEmpty>

    <!-- 外壳预渲染与数据还没回来时 -->
    <AkSpinner v-else-if="ops.length === 0" description="正在读取干员数据…" />

    <template v-else-if="state.sel.size > 0">
      <AkEmpty v-if="result.length === 0" title="没有可能出现的干员">
        <AkButton variant="link" @click="recruit.clear()">清空标签</AkButton
        >再选一次。
      </AkEmpty>
      <ol v-else class="hr-combos">
        <ComboItem v-for="c in result" :key="c.mask" :combo="c" />
      </ol>
    </template>
  </div>
</template>

<style scoped lang="scss">
.hr-combos {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--ak-border);
  background: var(--ak-bg-surface);
}
</style>
