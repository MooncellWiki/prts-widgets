<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";

import {
  NButton,
  NCard,
  NCollapseTransition,
  NConfigProvider,
  NLayout,
  NLayoutContent,
  NSpace,
  NTabPane,
  NTabs,
} from "naive-ui";

import { useTheme } from "@/utils/theme";

import { floorSortStore } from "./store";

const props = defineProps<{
  tabList: string[];
  eventNameList: string[][];
  floorList: string[];
}>();
const curCateTab = ref(props.tabList[0]);
const { theme, themeOverrides, isDark } = useTheme({
  common: { borderRadius: "0" },
  Card: { actionColor: "#343434", borderColor: "#ADADAD" },
  Tabs: {
    tabTextColorHoverLine: "#4294CF",
    tabTextColorActiveLine: "#4294CF",
    barColor: "#4294CF",
    tabFontWeightActive: "bold",
    tabGapSmallLine: "1em",
    tabPaddingSmallLine: "0.3em 0.5em",
  },
  Breadcrumb: { itemTextColor: "#A8AFB5" },
  Button: { textColorTextHover: "#4294CF", textColorTextPressed: "#07426D" },
});

const showFullCate = ref(false);

const tabChangeAndColseFullCate = () => {
  showFullCate.value = false;
};

const changeTab = (name: string) => {
  curCateTab.value = name;
  showFullCate.value = false;
};

function updateTippy(retry = 0) {
  const tippy = (
    globalThis as typeof globalThis & {
      tippy6?: (
        target: Element,
        options: Record<string, string | number | boolean | Element>,
      ) => void;
    }
  ).tippy6;
  if (!tippy) {
    if (retry < 20) window.setTimeout(() => updateTippy(retry + 1), 100);
    return;
  }

  for (const e of Array.from(document.querySelectorAll(".mc-tooltips"))) {
    if (!e.children || e.children.length < 2) continue;
    if ((e.children[0] as Element & { _tippy?: unknown })._tippy) continue;
    (e.children[1] as HTMLElement).style.display = "block";
    tippy(e.children[0], {
      content: e.children[1],
      arrow: true,
      theme: isDark.value ? "dark-border" : "light-border",
      size: "large",
      interactive: "true",
      maxWidth: Number.parseInt((e.children[1] as HTMLElement).dataset.size!),
      trigger:
        (e.children[1] as HTMLElement).dataset.trigger || "mouseenter focus",
    });
  }
}

function checkFloorAvil(ename: string) {
  return (
    floorSortStore.floorSort.curFloorTab === 0 ||
    floorSortStore.floorSort.eventFloorList[ename].includes(
      floorSortStore.floorSort.floorList[floorSortStore.floorSort.curFloorTab],
    )
  );
}

onMounted(() => {
  floorSortStore.floorSort.floorList = props.floorList;
  nextTick(updateTippy);
});
</script>

<template>
  <h2 id="ISEventNavHeader">事件导航</h2>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :theme-overrides="themeOverrides"
    :class="['ISEventCategory', isDark && 'prts-widget-dark']"
  >
    <NSpace class="max-w-full w-140">
      <NLayout>
        <NLayoutContent>
          <div class="bg-[#2f2f2f] px-2 py-1 c-white">
            <i class="mdi mdi-information-variant-circle"></i>
            可以使用鼠标滚轮或手指拖动来滚动分类栏，或点击
            <i class="mdi mdi-menu"></i> 展开所有分类查询。
          </div>
          <NCard class="relative" size="small">
            <NLayout>
              <div
                class="border-l-4 border-l-#2f2f2f border-l-solid px-1 font-bold"
              >
                分类筛选
              </div>
              <div></div>
            </NLayout>
            <NLayout class="my-1">
              <NCollapseTransition :show="showFullCate">
                <div
                  class="flex items-center justify-between bg-[#2f2f2f] px-1 pr-0 font-size-xs c-white"
                >
                  <div class="pointer-events-none">
                    <i class="mdi mdi-menu"></i>
                    Category.
                  </div>
                  <NButton
                    color="#2f2f2f"
                    size="small"
                    @click="
                      () => {
                        showFullCate = !showFullCate;
                      }
                    "
                  >
                    <i class="mdi mdi-chevron-up"></i>
                  </NButton>
                </div>
                <NSpace
                  class="bg-darkgray border b-[#2f2f2f50] b-solid from-[#e9e9e9] to-[#e9e9e900] bg-gradient-to-b pa-1.5"
                >
                  <NButton
                    v-for="tabName in tabList"
                    :key="tabName"
                    size="small"
                    :quaternary="tabName !== curCateTab"
                    :type="tabName === curCateTab ? 'info' : 'default'"
                    @click="changeTab(tabName)"
                  >
                    {{ tabName }}
                  </NButton>
                </NSpace>
              </NCollapseTransition>
              <NCollapseTransition :show="!showFullCate">
                <NTabs
                  v-model:value="curCateTab"
                  type="line"
                  size="small"
                  animated
                  :class="{ 'opacity-50': showFullCate }"
                  @update:value="tabChangeAndColseFullCate"
                >
                  <template #suffix>
                    <NButton
                      quaternary
                      size="small"
                      @click="
                        () => {
                          showFullCate = !showFullCate;
                        }
                      "
                    >
                      <i class="mdi mdi-menu"></i>
                    </NButton>
                  </template>
                  <NTabPane
                    v-for="(tabName, index) in tabList"
                    :key="tabName"
                    :name="tabName"
                    @click="tabChangeAndColseFullCate"
                  >
                    <NSpace class="max-w-full w-140">
                      <NButton
                        v-for="eventName in eventNameList![index]"
                        :key="eventName"
                        size="small"
                        quaternary
                        tag="a"
                        :href="`#${eventName}`"
                        :disabled="!checkFloorAvil(eventName)"
                      >
                        <span
                          :class="{
                            'decoration-line-through':
                              !checkFloorAvil(eventName),
                          }"
                          >{{ eventName }}</span
                        >
                      </NButton>
                    </NSpace>
                  </NTabPane>
                </NTabs>
              </NCollapseTransition>
            </NLayout>
            <NLayout>
              <div class="border-l-4 border-l-#2f2f2f border-l-solid px-1">
                <b>属层筛选</b>&nbsp;
                <span class="mc-tooltips">
                  <span
                    class="term"
                    style="
                      text-decoration: underline;
                      white-space: nowrap;
                      text-shadow: 0 0 1px;
                      color: #f59e0b;
                      cursor: help;
                    "
                  >
                    <i class="mdi mdi-alert-outline"></i>
                  </span>
                  <span style="display: none" data-size="350">
                    层数分类中的全部或部分内容为玩家统计数据，PRTS无法保证内容的时效性与准确性
                  </span>
                </span>
              </div>
              <NSpace class="my-1" :size="2">
                <NButton
                  v-for="(floorName, index) in floorList"
                  :key="floorName"
                  size="small"
                  :quaternary="index !== floorSortStore.floorSort.curFloorTab"
                  :type="
                    index === floorSortStore.floorSort.curFloorTab
                      ? 'info'
                      : 'default'
                  "
                  @click="floorSortStore.floorSort.curFloorTab = index"
                >
                  {{ floorName }}
                </NButton>
              </NSpace>
            </NLayout>
          </NCard>
        </NLayoutContent>
      </NLayout>
    </NSpace>
  </NConfigProvider>
</template>

<style scoped>
@import "@/styles/dark-mode.scss";
@import "./dark-mode.css";
a {
  text-decoration: none;
  color: unset;
}

:deep(.n-tabs .n-tabs-nav .n-tabs-nav__suffix) {
  padding-left: 0.2em;
}
</style>
