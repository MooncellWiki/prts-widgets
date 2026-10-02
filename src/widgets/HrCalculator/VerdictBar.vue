<script setup lang="ts">
import { computed } from "vue";

import { AkButton, useToast } from "@mooncellwiki/prts-design-vue";

import { DURATIONS, LONGEST, MAX_TAGS, ROBOT } from "./consts";
import { useRecruit } from "./store";
import { writeQuery } from "./url";

/** 结论先说：几组能保底 4★ 以上、最高几星、是哪一组、还能再选几个；右边「复制分享链接」 */
const recruit = useRecruit();
const { state, result } = recruit;
const toast = useToast();

const dur = computed(() => DURATIONS[state.dur]);
const good = computed(() => result.value.tiers.flatMap((t) => t.combos));
const best = computed(() => good.value[0]);
/** 最高保底的那一组；同保底的不止一组时加「等」 */
const bestTags = computed(() => {
  const top = best.value;
  if (!top) return "";
  const tags = top.tags.map((t) => `【${t}】`).join(" + ");
  return good.value.filter((c) => c.min === top.min).length > 1
    ? `${tags} 等`
    : tags;
});
const left = computed(() => MAX_TAGS - state.sel.size);

async function copyLink() {
  const url = `${location.origin}${location.pathname}${writeQuery(
    location.search,
    state.sel,
    state.dur,
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
    <p class="hr-verdict" role="status">
      <template v-if="state.sel.size === 0">
        还没选标签。把招募位上出现的
        <b>{{ MAX_TAGS }} 个标签</b
        >点上，就能看到哪几个组合有保底；下面是全部保底组合的速查。
      </template>
      <template v-else-if="result.list.length === 0">
        时限 <b>{{ dur.label }}</b
        >（{{ dur.lo }}–{{ dur.hi }}★）下，这几个标签圈不出任何干员。
      </template>
      <template v-else>
        <template v-if="best">
          <b>{{ good.length }}</b> 组能保底 4★ 以上，最高<span
            class="hr-star"
            :data-rarity="best.min"
            >{{ best.min }}★</span
          >（{{ bestTags }}）。
        </template>
        <template v-else-if="result.robots.length">
          没有保底 4★ 以上的组合；选【{{ ROBOT }}】必得 1★ 支援机械。
        </template>
        <template v-else>
          没有保底 4★ 以上的组合{{
            state.dur === LONGEST ? "——不选标签也一样，按想要的干员挑即可" : ""
          }}。
        </template>
        <template v-if="left > 0"> 还可以再选 {{ left }} 个标签。</template>
      </template>
    </p>
    <div class="hr-bar__tools">
      <AkButton variant="ghost" size="sm" icon="link" @click="copyLink">
        复制分享链接
      </AkButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hr-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
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

.hr-verdict {
  flex: 1 1 320px;
  min-width: 0;
  margin: 0;
  font-size: var(--ak-fs-sm);
  line-height: 1.5;
  color: var(--ak-fg-secondary);

  b {
    font-weight: 700;
    color: var(--ak-fg);
  }
}

.hr-star {
  font: 700 var(--ak-fs-h3) / 1 var(--ak-font-label);
  color: var(--ak-r-text);
  margin: 0 2px;
}
</style>
