<script setup lang="ts">
import { computed } from "vue";

import { AkButton, AkMessage } from "@mooncellwiki/prts-design-vue";

import { DURATIONS, LONGEST, MAX_TAGS, ROBOT, SENIOR, TOP } from "./consts";
import { useRecruit } from "./store";

/**
 * 选了和时限有关的标签时的提示，带一枚直接改时限的按钮：
 *   稀有标签只在 9:00 锁定（游戏的招募说明；开始招募时的确认框「当前招募时限小于9小时，未锁定稀有职业需求」）；
 *   想要 1★ 支援机械，时限不要超过 3:50（recruitRarityTable）。
 */
const recruit = useRecruit();
const { state } = recruit;

const seniors = computed(() =>
  [TOP, SENIOR].filter((t) => state.sel.has(t)).map((t) => `【${t}】`),
);
// 游戏的招募说明：含高级资深干员 + 9 小时必得 6★；含资深干员、不含高级资深干员 + 9 小时必得 5★
const sure = computed(() => (state.sel.has(TOP) ? "必得 6★" : "必得 5★"));
const longest = computed(() => state.dur === LONGEST);
</script>

<template>
  <div
    v-if="seniors.length || state.sel.has(ROBOT) || state.sel.size > MAX_TAGS"
    class="hr-tips"
  >
    <template v-if="seniors.length">
      <AkMessage v-if="longest">
        <span>
          {{ seniors.join("") }}：招募时限拉满
          <b>9:00</b> 才锁定稀有职业需求——选上它{{ sure }}。
        </span>
      </AkMessage>
      <AkMessage v-else variant="warning">
        <span>
          招募时限小于 9 小时，<b>未锁定稀有职业需求</b>——{{
            seniors.join("")
          }}可能被划掉。
        </span>
        <AkButton size="sm" @click="recruit.setDur(LONGEST)">
          改成 {{ DURATIONS[LONGEST].label }}
        </AkButton>
      </AkMessage>
    </template>

    <template v-if="state.sel.has(ROBOT)">
      <AkMessage v-if="state.dur === 0">
        <span>
          【{{ ROBOT }}】：时限不要超过 <b>3:50</b>，才可能出 1★ 支援机械。
        </span>
      </AkMessage>
      <AkMessage v-else variant="warning">
        <span>
          想要 1★ 支援机械：时限不要超过 <b>3:50</b>——当前这一档不出 1★。
        </span>
        <AkButton size="sm" @click="recruit.setDur(0)">
          改成 {{ DURATIONS[0].label }}
        </AkButton>
      </AkMessage>
    </template>

    <AkMessage v-if="state.sel.size > MAX_TAGS" variant="warning">
      <span>
        这条链接带了 {{ state.sel.size }} 个标签；游戏里一个招募位只出现
        {{ MAX_TAGS }} 个，下面的组合有些在同一次招募里选不出来。
      </span>
    </AkMessage>
  </div>
</template>

<style scoped lang="scss">
.hr-tips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 var(--ak-space-3);

  > .ak-message {
    margin: 0;
    align-items: center;
    padding: 8px var(--ak-space-3);
  }

  // 正文一行字 + 右端一枚改时限的按钮
  :deep(.ak-message__body) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;

    > .ak-btn {
      margin-left: auto;
      flex: none;
    }
  }
}
</style>
