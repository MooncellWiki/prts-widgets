<script setup lang="ts">
import {
  NButton,
  NCard,
  NConfigProvider,
  NLayout,
  NLayoutContent,
  NSpace,
  NTabPane,
  NTabs,
} from "naive-ui";
defineProps<{
  tabList: string[];
  eventNameList: string[][];
}>();
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
            可以使用鼠标滚轮或手指拖动来滚动分类栏。
          </div>
          <NCard class="relative" size="small">
            <NTabs type="line" size="small" animated>
              <NTabPane
                v-for="(tabName, index) in tabList"
                :key="tabName"
                :name="tabName"
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
          </NCard>
        </NLayoutContent>
      </NLayout>
    </NSpace>
  </NConfigProvider>
</template>

<style>
.ISEventFrame .n-breadcrumb .n-breadcrumb-item .n-breadcrumb-item__separator {
  margin: 0 !important;
}

.ISEventFrame .n-breadcrumb ul {
  margin: 0 !important;
  padding: 0.2em !important;
}

.ISEventFrame .n-breadcrumb li {
  margin: 0 !important;
}

.ISEventFrame
  .n-collapse
  .n-collapse-item.n-collapse-item--left-arrow-placement
  .n-collapse-item__header
  .n-collapse-item-arrow {
  margin: 0 !important;
}

.ISEventFrame
  .n-collapse
  .n-collapse-item
  .n-collapse-item__content-wrapper
  .n-collapse-item__content-inner {
  padding-top: 0.5em !important;
}

.ISEventCategory a {
  text-decoration: none;
  color: unset;
}
</style>
