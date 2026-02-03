<script setup lang="ts">
import { ref } from "vue";

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
const props = defineProps<{
  tabList: string[];
  eventNameList: string[][];
}>();
const curTab = ref(props.tabList[0]);

const showFullCate = ref(false);

const tabChangeAndColseFullCate = () => {
  showFullCate.value = false;
};

const changeTab = (name: string) => {
  curTab.value = name;
  showFullCate.value = false;
};
</script>

<template>
  <h2>事件导航</h2>
  <NConfigProvider
    preflight-style-disabled
    :theme-overrides="{
      common: {
        borderRadius: '0',
      },
      Card: {
        actionColor: '#343434',
        borderColor: '#ADADAD',
      },
      Tabs: {
        tabTextColorHoverLine: '#4294CF',
        tabTextColorActiveLine: '#4294CF',
        barColor: '#4294CF',
        tabFontWeightActive: 'bold',
        tabGapSmallLine: '1em',
        tabPaddingSmallLine: '0.3em 0.5em',
      },
      Breadcrumb: { itemTextColor: '#A8AFB5' },
      Button: {
        textColorTextHover: '#4294CF',
        textColorTextPressed: '#07426D',
      },
    }"
    class="ISEventCategory"
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
                  :quaternary="tabName === curTab ? false : true"
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
                      v-for="eventName in eventNameList![index]"
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
</template>

<style scoped>
a {
  text-decoration: none;
  color: unset;
}

:deep(.n-tabs .n-tabs-nav .n-tabs-nav__suffix) {
  padding-left: 0.2em;
}
</style>
