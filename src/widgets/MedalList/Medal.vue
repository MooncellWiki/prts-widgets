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
    const rarityGradient: Record<number, string> = {
      1: "from-[#75655d] to-[#decaa2]",
      2: "from-[#83898b] to-[#7bb7b7]",
      3: "from-[#a56e37] to-[#f5c391]",
    };

    return {
      getImagePath,
      isDecrypt: ref(false),
      showTrimed: ref(false),
      rarityGradient,
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
            :class="[
              'p-8',
              {
                'bg-gradient-to-b from-[#485a5c] to-[#1d0942]':
                  showTrimed && medalData.isTrim,
              },
            ]"
            :src="`/images/${getImagePath(
              `蚀刻章_${medalData.alias}${
                showTrimed && medalData.isTrim ? '_镀层' : ''
              }.png`,
            )}`"
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
          <h3
            :class="[
              'p-2.5! m-0! bg-gradient-to-r color-white',
              rarityGradient[medalData.rarity],
            ]"
          >
            {{ medalData.name }}
          </h3>
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
                :style="{ background: isDecrypt ? '#1976d2' : '#262626FF' }"
                :arrow-style="{
                  background: isDecrypt ? '#1976d2' : '#262626FF',
                }"
              >
                <template #trigger>
                  <NTag v-model:checked="isDecrypt" checkable>{{
                    isDecrypt ? "破译结果" : "获得方式"
                  }}</NTag>
                </template>
                点击{{ isDecrypt ? "加密" : "破译" }}蚀刻章获得方式
              </NTooltip>
              <span class="pl-1">{{
                isDecrypt ? medalData.decrypt : medalData.method
              }}</span>
            </div>
            <div v-if="medalData.isTrim" class="mt-0.5">
              <NTooltip
                trigger="hover"
                :style="{ background: '#262626FF' }"
                :arrow-style="{ background: '#262626FF' }"
              >
                <template #trigger>
                  <NTag
                    v-model:checked="showTrimed"
                    checkable
                    class="bg-gradient-to-b from-[#b2ebf2] to-[#d1c4e9] color-[#2f2f2f]! border-[#565656] font-bold"
                    >镀层方式</NTag
                  >
                </template>
                点击切换显示{{ showTrimed ? "未镀层" : "镀层" }}章
              </NTooltip>
              <span class="pl-1">{{ medalData.trimMethod }}</span>
            </div>
          </div>
        </div>
      </div>
    </NCard>
  </NConfigProvider>
</template>
