<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

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

const props = defineProps<{
  tabList: string[];
  eventNameList: string[][];
  eventFloorList: string[][][];
}>();
const curTab = ref(props.tabList[0]);
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
const activeFloor = ref("");
const romanFloorLabels = ["", "I", "II", "III", "IV", "V", "VI", "VII"];
const eventFloorListDepth = 2;
const hasFloorData = computed(() =>
  props.eventFloorList.some((group) =>
    group.some((floors) => floors.length > 0),
  ),
);
const floorButtons = computed(() => {
  const floorValues = Array.from(
    new Set(props.eventFloorList.flat(eventFloorListDepth).filter(Boolean)),
  ).sort((a, b) => Number(a) - Number(b));
  return [
    { label: "全部", value: "" },
    ...floorValues.map((floor) => ({
      label: romanFloorLabels[Number(floor)] || floor,
      value: floor,
    })),
  ];
});
const visibleEventNameList = computed(() => {
  if (!activeFloor.value) return props.eventNameList;
  return props.eventNameList.map((group, groupIndex) =>
    group.filter((_eventName, eventIndex) =>
      props.eventFloorList[groupIndex]?.[eventIndex]?.includes(
        activeFloor.value,
      ),
    ),
  );
});

const tabChangeAndColseFullCate = () => {
  showFullCate.value = false;
};

const changeTab = (name: string) => {
  curTab.value = name;
  showFullCate.value = false;
};

const changeFloor = (floor: string) => {
  activeFloor.value = floor;
};

function applyFloorFilter() {
  const floor = activeFloor.value;
  const allEventTitles = new Set(props.eventNameList.flat());
  const allEventTypes = new Set(props.tabList);
  const visibleTitles = new Set<string>();
  const visibleTypes = new Set<string>();

  for (const frame of Array.from(
    document.querySelectorAll<HTMLElement>(".ISEventFrame"),
  )) {
    const floors = (frame.dataset.floors || "").split("|").filter(Boolean);
    const visible = !floor || floors.includes(floor);
    frame.style.display = visible ? "" : "none";
    if (visible) {
      if (frame.dataset.eventTitle) visibleTitles.add(frame.dataset.eventTitle);
      if (frame.dataset.eventType) visibleTypes.add(frame.dataset.eventType);
    }
  }

  for (const description of Array.from(
    document.querySelectorAll<HTMLElement>(".ISEventDescription"),
  )) {
    const floors = (description.dataset.floors || "")
      .split("|")
      .filter(Boolean);
    description.style.display = !floor || floors.includes(floor) ? "" : "none";
  }

  for (const heading of Array.from(
    document.querySelectorAll<HTMLElement>(
      ".mw-parser-output h2, .mw-parser-output h3",
    ),
  )) {
    const title = (heading.textContent || "").trim();
    if (title === "事件导航" || title === "层数筛选") {
      heading.style.display = "";
    } else if (allEventTitles.has(title)) {
      heading.style.display = !floor || visibleTitles.has(title) ? "" : "none";
    } else if (allEventTypes.has(title)) {
      heading.style.display = !floor || visibleTypes.has(title) ? "" : "none";
    }
  }
}

watch(
  activeFloor,
  () => {
    nextTick(() => {
      window.requestAnimationFrame(applyFloorFilter);
    });
  },
  { immediate: true },
);
</script>

<template>
  <h2>事件导航</h2>
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
            <NCollapseTransition :show="showFullCate">
              <div
                class="flex items-center justify-between bg-[#2f2f2f] px-1 pr-0 font-size-xs c-white"
              >
                <div class="pointer-events-none">
                  <i class="mdi mdi-menu"></i>
                  分类
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
                  :quaternary="tabName !== curTab"
                  :type="tabName === curTab ? 'info' : 'default'"
                  @click="changeTab(tabName)"
                >
                  {{ tabName }}
                </NButton>
              </NSpace>
            </NCollapseTransition>
            <NCollapseTransition :show="!showFullCate">
              <NTabs
                v-model:value="curTab"
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
                      v-for="eventName in visibleEventNameList[index]"
                      :key="eventName"
                      size="small"
                      quaternary
                      tag="a"
                      :href="`#${eventName}`"
                    >
                      {{ eventName }}
                    </NButton>
                  </NSpace>
                </NTabPane>
              </NTabs>
            </NCollapseTransition>
          </NCard>
        </NLayoutContent>
      </NLayout>
    </NSpace>
  </NConfigProvider>
  <h2 v-if="hasFloorData">层数筛选</h2>
  <NConfigProvider
    v-if="hasFloorData"
    preflight-style-disabled
    :theme="theme"
    :theme-overrides="themeOverrides"
    :class="['ISEventCategory', isDark && 'prts-widget-dark']"
  >
    <NSpace class="max-w-full w-140">
      <NButton
        v-for="button in floorButtons"
        :key="button.value || 'all'"
        size="small"
        :quaternary="button.value !== activeFloor"
        :type="button.value === activeFloor ? 'info' : 'default'"
        @click="changeFloor(button.value)"
      >
        {{ button.label }}
      </NButton>
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
