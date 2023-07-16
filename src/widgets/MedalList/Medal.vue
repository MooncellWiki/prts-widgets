<script lang="ts">
import { defineComponent, ref, type PropType } from "vue";

import {
  NCard,
  NConfigProvider,
  NH3,
  NImage,
  NLayout,
  NLayoutContent,
  NLayoutFooter,
  NLayoutHeader,
  NLayoutSider,
  NTag,
  NTooltip,
  zhCN,
} from "naive-ui";

import { getImagePath } from "../../utils/utils";

export default defineComponent({
  components: {
    NConfigProvider,
    NCard,
    NImage,
    NLayout,
    NLayoutSider,
    NLayoutHeader,
    NLayoutContent,
    NLayoutFooter,
    NH3,
    NTag,
    NTooltip,
  },
  props: {
    medalData: {
      type: Object as PropType<{
        alias: string;
        name: string;
        desc: string;
        method: string;
        decrypt: string;
      }>,
      required: true,
    },
  },
  setup() {
    const inDecrypt = ref(false);
    return {
      getImagePath,
      inDecrypt,
      zhCN,
    };
  },
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :locale="zhCN"
    :theme-overrides="{
      Card: {
        paddingMedium: '0',
      },
      Tag: {
        colorCheckable: '#565656',
        textColorCheckable: 'white',
        colorPressedCheckable: '#2E33387A',
        textColorPressedCheckable: 'white',
        colorChecked: '#1976d2',
        colorCheckedHover: '#52A5F7',
        colorCheckedPressed: '#707070FF',
      },
      Image: {
        toolbarColor: '#000000B3',
        toolbarBorderRadius: '5px',
      },
    }"
  >
    <NCard>
      <NLayout has-sider>
        <NLayoutSider
          bordered
          content-style="padding: 20px; text-align:center; background:#464646;"
          width="150"
        >
          <NImage
            width="100"
            :src="`/images/${getImagePath(`蚀刻章_${medalData.alias}.png`)}`"
            show-toolbar-tooltip
            :previewed-img-props="{
              style: {
                background: '#2f2f2fdb',
                padding: '10px',
                borderRadius: '5px',
              },
            }"
          />
        </NLayoutSider>
        <NLayout>
          <NLayoutHeader bordered style="padding: 10px">
            <NH3 style="padding: 0">{{ medalData.name }}</NH3>
          </NLayoutHeader>
          <NLayoutContent bordered content-style="padding: 10px;">
            <span
              style="white-space: pre-wrap; font-style: italic"
              v-html="medalData.desc"
            ></span>
          </NLayoutContent>
          <NLayoutFooter bordered style="padding: 10px">
            <template v-if="!medalData.decrypt">
              <NTag
                :color="{
                  color: '#565656',
                  textColor: 'white',
                  borderColor: '#565656',
                }"
                >获得方式</NTag
              >
              {{ medalData.method }}
            </template>
            <template v-if="medalData.decrypt">
              <NTooltip
                trigger="hover"
                :style="{ background: inDecrypt ? '#1976d2' : '#262626FF' }"
                :arrow-style="{
                  background: inDecrypt ? '#1976d2' : '#262626FF',
                }"
              >
                <template #trigger>
                  <NTag v-model:checked="inDecrypt" checkable>{{
                    inDecrypt ? "破译结果" : "获得方式"
                  }}</NTag>
                </template>
                点击{{ inDecrypt ? "加密" : "破译" }}蚀刻章获得方式
              </NTooltip>
              {{ inDecrypt ? medalData.decrypt : medalData.method }}
            </template>
          </NLayoutFooter>
        </NLayout>
      </NLayout>
    </NCard>
  </NConfigProvider>
</template>
