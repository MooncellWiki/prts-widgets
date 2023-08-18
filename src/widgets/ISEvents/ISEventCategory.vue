<script lang="ts">
import type { PropType } from "vue";
import { defineComponent } from "vue";

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

export default defineComponent({
  components: {
    NButton,
    NCard,
    NConfigProvider,
    NSpace,
    NLayout,
    NLayoutContent,
    NTabs,
    NTabPane,
  },
  props: {
    tabList: Array as PropType<string[]>,
    eventNameList: Array as PropType<string[][]>,
  },
});
</script>

<template>
  <h2>事件导航</h2>
  <NConfigProvider
    preflight-style-disabled
    :theme-overrides="{
      Card: {
        borderRadius: '5px',
        actionColor: '#343434',
        borderColor: '#ADADAD',
      },
      Tabs: {
        tabTextColorHoverLine: '#4294CF',
        tabTextColorActiveLine: '#4294CF',
        barColor: '#4294CF',
        tabFontWeightActive: 'bold',
        tabGapSmallLine: '20px',
      },
      Breadcrumb: { itemTextColor: '#A8AFB5' },
      Button: {
        textColorTextHover: '#4294CF',
        textColorTextPressed: '#07426D',
      },
    }"
  >
    <NSpace class="w-140 max-w-full">
      <NLayout>
        <NLayoutContent>
          <NCard class="relative" size="small">
            <NTabs type="line" size="small" animated>
              <NTabPane
                v-for="(tabName, index) in tabList"
                :key="tabName"
                :name="tabName"
              >
                <NSpace class="w-140 max-w-full">
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
