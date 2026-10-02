<script setup lang="ts">
import { computed, ref } from "vue";

import {
  AkButton,
  AkDialog,
  AkSelect,
  AkTag,
  useToast,
} from "@mooncellwiki/prts-design-vue";
import { storeToRefs } from "pinia";

import Pager from "./Pager.vue";
import { PAGE_STEPS } from "./consts";
import { filterTitle, selectedOptions } from "./filter";
import { useCharListStore } from "./store";

/**
 * 结果栏：条数 · 已选条件 · 复制短链接 · 每页条数 · 分页。
 * 已选条件在这里再列一遍（可逐个移除）：筛选面板滚出视口后，仍看得到当前结果是怎么筛出来的。
 * 条数后面的问号说明这个数是怎么来的（弹框，见 .ol-bar__help）。
 */
const store = useCharListStore();
const { state } = store;
const { list, filters, chars } = storeToRefs(store);
const toast = useToast();

const STEP_OPTIONS = PAGE_STEPS.map((n) => ({ label: `每页 ${n}`, value: n }));

/** 条数说明弹框 */
const countHelp = ref(false);

const active = computed(() =>
  filters.value.flatMap((f) =>
    selectedOptions(f).map(({ id, label }) => ({
      filter: f,
      id,
      // 势力行切到作战模式时，行名写成「作战势力」
      text: `${filterTitle(f)}${f.selection.and ? "（同时）" : ""}：${label}`,
    })),
  ),
);
const activeCount = computed(() => active.value.length + (state.q ? 1 : 0));

async function copyLink() {
  // CHAR 是站内给干员一览留的短链接入口
  const url = `${location.origin}/w/CHAR${location.hash}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success(decodeURIComponent(url), { title: "链接已复制" });
  } catch {
    toast.error(decodeURIComponent(url), { title: "复制失败，请手动复制" });
  }
}
</script>

<template>
  <div class="ol-bar">
    <div class="ol-bar__num">
      <span class="ol-bar__count" role="status">
        <template v-if="list.length === chars.length">
          共 <b>{{ chars.length }}</b> 位干员
        </template>
        <template v-else>
          <b>{{ list.length }}</b> / {{ chars.length }} 位干员
        </template>
      </span>
      <AkButton
        class="ol-bar__help"
        variant="ghost"
        size="xs"
        label="关于干员计数"
        @click="countHelp = true"
      >
        ?
      </AkButton>
    </div>
    <div class="ol-bar__active ak-tags">
      <AkTag v-if="state.q" removable @remove="state.q = ''">
        搜索：{{ state.q }}
      </AkTag>
      <AkTag
        v-for="item in active"
        :key="`${item.filter.id}:${item.id}`"
        removable
        @remove="store.toggle(item.filter, item.id)"
      >
        {{ item.text }}
      </AkTag>
      <AkButton
        v-if="activeCount > 1"
        variant="link"
        size="xs"
        @click="store.reset()"
      >
        清除全部
      </AkButton>
    </div>
    <div class="ol-bar__tools">
      <AkButton variant="ghost" size="sm" icon="link" @click="copyLink">
        复制短链接
      </AkButton>
      <AkSelect
        :model-value="state.step"
        :options="STEP_OPTIONS"
        label="每页条数"
        @update:model-value="store.setStep(Number($event))"
      />
      <Pager label="分页" />
    </div>

    <!-- 条数说明：原生 <dialog>，开着的时候在顶层，放哪都不影响这条栏的排布 -->
    <AkDialog v-model="countHelp" title="关于干员计数" size="sm">
      <p class="ol-bar__help-text">
        本站的干员计数记录的是<b>所有单个个体干员</b>的数量，也即<a
          class="ol-link"
          href="/w/阿米娅"
          >阿米娅</a
        >的不同升变将分别计1名干员。
      </p>
    </AkDialog>
  </div>
</template>

<style scoped lang="scss">
.ol-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0 0 var(--ak-space-3);
  min-height: 32px;

  &__num {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  &__count {
    font-size: var(--ak-fs-sm);
    color: var(--ak-fg-muted);
    white-space: nowrap;

    b {
      font: 700 var(--ak-fs-h3) / 1 var(--ak-font-label);
      color: var(--ak-fg);
      font-variant-numeric: tabular-nums;
      margin-right: 2px;
    }
  }

  // 条数后面的问号：一小枚圆形钮，别抢了数字的视线
  &__help.ak-btn {
    --_bd: var(--ak-border-strong);

    box-sizing: border-box;
    min-width: 20px;
    min-height: 20px;
    height: 20px;
    padding: 0 5px;
    line-height: 1;
    font-weight: 700;
    color: var(--ak-fg-muted);

    &:hover {
      color: var(--ak-fg);
    }
  }

  &__help-text {
    margin: 0;
  }

  &__active {
    flex: 1 1 200px;
    min-width: 0;
    align-items: center;

    .ak-tag {
      height: 24px;
    }

    :deep(.ak-tag__remove:focus-visible) {
      outline: 2px solid var(--ak-focus);
    }
  }

  &__tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-left: auto;

    .ak-select {
      width: auto;
      min-height: 32px;
      font-size: var(--ak-fs-xs);
    }

    .ol--narrow & {
      margin-left: 0;
      width: 100%;
      justify-content: space-between;
    }
  }

  :deep(.ak-icon) {
    width: 14px;
    height: 14px;
  }

  .ol-link {
    color: var(--ak-link);
  }
}
</style>
