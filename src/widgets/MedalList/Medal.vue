<script lang="ts">
import { defineComponent, ref, type PropType } from "vue";

import { NCard, NConfigProvider, NImage, NTag, NTooltip } from "naive-ui";

import { getImagePath } from "../../utils/utils";

import type { Medal } from "./types";

export default defineComponent({
  components: {
    NConfigProvider,
    NCard,
    NImage,
    NTag,
    NTooltip,
  },
  props: {
    medalData: {
      type: Object as PropType<Medal>,
      required: true,
    },
  },
  setup() {
    const inDecrypt = ref(false);
    return {
      getImagePath,
      inDecrypt,
    };
  },
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
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
      <div class="flex <lg:flex-col">
        <div class="bg-[#464646] <lg:flex <lg:justify-center <lg:w-full">
          <NImage
            width="100"
            class="p-8"
            :src="`/images/${getImagePath(`蚀刻章_${medalData.alias}.png`)}`"
            show-toolbar-tooltip
            :previewed-img-props="{
              style: {
                padding: '20px',
                background: '#2f2f2fdb',
                borderRadius: '5px',
              },
            }"
          />
        </div>
        <div class="flex flex-col w-full divide-y!">
          <h3 class="p-2.5!">{{ medalData.name }}</h3>
          <div
            class="p-2.5! grow flex items-center align-middle border-0 border-solid border-[#e5e7eb]"
          >
            <span
              class="whitespace-pre-wrap font-italic"
              v-html="medalData.desc"
            />
          </div>
          <div
            class="p-2.5! border-0 border-solid border-[#e5e7eb] bg-[#fafafc] align-middle"
          >
            <div v-if="!medalData.decrypt">
              <NTag
                :color="{
                  color: '#565656',
                  textColor: 'white',
                  borderColor: '#565656',
                }"
                >获得方式</NTag
              ><span class="pl-1">{{ medalData.method }}</span>
            </div>
            <div v-else>
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
              <span class="pl-1">{{
                inDecrypt ? medalData.decrypt : medalData.method
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </NCard>
  </NConfigProvider>
</template>
