<script lang="ts">
import { defineComponent, ref, type PropType } from "vue";

import { NCard, NConfigProvider, NImage, NTag, NTooltip, NGradientText } from "naive-ui";

import { getImagePath } from "../../utils/utils";

import type { Medal } from "./types";

export default defineComponent({
  components: {
    NConfigProvider,
    NCard,
    NImage,
    NTag,
    NTooltip,
    NGradientText,
  },
  props: {
    medalData: {
      type: Object as PropType<Medal>,
      required: true,
    },
  },
  setup() {
    const inDecrypt = ref(false);
    const showTrimed = ref(false);
    const rarityGradient = ref([
      "linear-gradient(90deg, #75655d, #decaa2)",
      "linear-gradient(90deg, #83898b, #7bb7b7)",
      "linear-gradient(90deg, #a56e37, #f5c391)",
    ]);
    return {
      getImagePath,
      inDecrypt,
      showTrimed,
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
            v-if="!showTrimed"
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
          <NImage
            v-if="showTrimed && medalData.isTrim"
            width="100"
            class="p-8"
            style="background: linear-gradient(#485a5c, #1d0942);"
            :src="`/images/${getImagePath(
              `蚀刻章_${medalData.alias}_镀层.png`,
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
            class="p-2.5! m-0!"
            :style="'color:white; background:' + rarityGradient[medalData.rarity - 1]"
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
            <div v-if="medalData.isTrim" style="margin-top: 2px;">
              <NTooltip
                trigger="hover"
                :style="{ background: '#262626FF' }"
                :arrow-style="{ background: '#262626FF' }"
              >
                <template #trigger>
                  <NTag
                    v-model:checked="showTrimed" checkable
                    style="
                      background: linear-gradient(#B2EBF2,#D1C4E9);
                      color: #2f2f2f;
                      border-color: #565656;
                      font-weight: bold;
                    "
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
