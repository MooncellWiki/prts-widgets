<script setup lang="ts">
import { provide, useTemplateRef, watch } from "vue";

import { AkButton, AkEmpty } from "@mooncellwiki/prts-design-vue";
import { isClient, useElementSize, useEventListener } from "@vueuse/core";

import ListPager from "@/components/list/ListPager.vue";
import { useHoverTip } from "@/utils/useHoverTip";

import ResultBar from "./ResultBar.vue";
import Toolbar from "./Toolbar.vue";
import { View } from "./consts";
import FilterPanel from "./filter/FilterPanel.vue";
import OpList from "./result/OpList.vue";
import SkillList from "./result/SkillList.vue";
import { baseSkillListKey, createBaseSkillList } from "./store";

import type { Source } from "./data";

/**
 * 数据到了以后的整页：建状态、和地址栏同步、量宽度、画提示气泡。
 * .ak-* 是设计系统组件（样式来自皮肤 / skins.arknights.components），.rs-* 是这页自己的排布（各组件的 scoped 样式）。
 */
const props = defineProps<{ source: Source; room: string }>();

const store = createBaseSkillList(props.source, { room: props.room });
provide(baseSkillListKey, store);
const { state, shown, page, pageCount, hash } = store;

/*
 * 地址栏（只在一览页上；设施页的 # 是章节锚点和 tabber 的，不碰）：打开时读一次、# 变了再读，筛选一变就写回（replaceState，不留历史），
 * 写法同干员一览 / 道具一览。不带 = 的是页内锚点，不当成清空。
 */
if (!store.room) {
  const loadHash = () => {
    if (!location.hash || location.hash.includes("="))
      store.load(location.hash);
  };
  if (isClient) loadHash();
  useEventListener("hashchange", loadHash);
  watch(hash, (h) => {
    if (h === location.hash.slice(1)) return;
    history.replaceState(
      null,
      "",
      h ? `#${h}` : location.pathname + location.search,
    );
  });
}

/* 排布看结果区自己的宽度，不看视口（侧栏收起 / 展开都会改变它）：< 860 持有干员折到描述下面，< 640 是手机排布 */
const root = useTemplateRef<HTMLElement>("root");
// 挂载前（含外壳预渲染）是 +∞：先按最宽的排布出
const { width } = useElementSize(
  root,
  { width: Number.POSITIVE_INFINITY, height: 0 },
  { box: "border-box" },
);

/* 在底部翻页：回到结果开头 */
const result = useTemplateRef<HTMLElement>("result");
function toPage(n: number) {
  store.setPage(n);
  result.value?.scrollIntoView({ block: "start" });
}

/* 持有干员 / 效率 / 描述里的术语：锚点带 data-tip，气泡按视口定位，不被分组的框裁掉 */
const { tip, handlers: tipHandlers } = useHoverTip(
  useTemplateRef<HTMLElement>("bubble"),
  "[data-tip]",
);
</script>

<template>
  <div
    ref="root"
    :class="[
      'rs-root',
      {
        'rs--embed': store.room,
        'rs--narrow': width < 640,
        'rs--compact': width < 860,
      },
    ]"
    v-on="tipHandlers"
  >
    <FilterPanel :narrow="width < 640" />
    <Toolbar />
    <ResultBar :narrow="width < 640" />

    <div ref="result" class="rs-result">
      <AkEmpty v-if="shown === 0" title="没有符合条件的后勤技能">
        放宽几项筛选条件，或者<AkButton variant="link" @click="store.reset()">
          清除全部条件</AkButton
        >。
      </AkEmpty>
      <OpList v-else-if="state.view === View.OP" />
      <SkillList v-else />
    </div>

    <div class="rs-foot">
      <ListPager
        :page="page"
        :page-count="pageCount"
        label="分页（底部）"
        :narrow="width < 640"
        @update:page="toPage"
      />
    </div>
  </div>

  <div
    v-if="tip"
    ref="bubble"
    class="ak-tooltip rs-tip"
    role="tooltip"
    :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
  >
    {{ tip.text }}
  </div>
</template>

<style scoped lang="scss">
// 窄排布不用 @media：看的是结果区自己的宽度（根节点的 .rs--narrow / .rs--compact），各组件的样式里用 `.rs--narrow &` 接

// 页眉吸顶只有 Arknights 皮肤有：翻页回到结果开头时让出页眉
.rs-result {
  scroll-margin-top: var(--ak-space-3);

  .skin-arknights & {
    scroll-margin-top: calc(var(--ak-header-h) + var(--ak-space-3));
  }
}

.rs-foot {
  display: flex;
  justify-content: flex-end;
  margin: var(--ak-space-4) 0 0;

  .rs--narrow & {
    justify-content: center;
  }
}

// 提示：按视口定位，不吃指针事件；术语解释是几行字，照原样分行
.rs-tip.ak-tooltip {
  position: fixed;
  max-width: min(340px, calc(100vw - 16px));
  white-space: pre-line;
  line-height: 1.55;
  pointer-events: none;
}
</style>
