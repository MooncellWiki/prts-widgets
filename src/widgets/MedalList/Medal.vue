<script setup lang="ts">
import { ref } from "vue";

import {
  NBadge,
  NCard,
  NConfigProvider,
  NEl,
  NImage,
  NTag,
  NTooltip,
} from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath } from "@/utils/utils";

import MiniMedalComponent from "./MiniMedal.vue";

import type { Medal, MiniMedal } from "./types";

withDefaults(
  defineProps<{
    medalData: Medal;
    showDeprecateBadge?: boolean;
    miniMedalData?: Record<string, MiniMedal>;
  }>(),
  {
    showDeprecateBadge: true,
  },
);

const rarityGradient: Record<number, string> = {
  1: "from-[#75655d] to-[#decaa2]",
  2: "from-[#83898b] to-[#7bb7b7]",
  3: "from-[#a56e37] to-[#f5c391]",
};

const rarityStarColor: Record<number, string> = {
  1: "color-white",
  2: "color-[#d7ffff]",
  3: "color-[#ffeebe]",
};

const rarityImgStyleSet: Record<number, string[]> = {
  1: ["p-8", "100"],
  2: ["p-6", "100"],
  3: ["p-4", "100"],
};

const isDecrypt = ref(false);
const showTrimed = ref(false);
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme-overrides="{
      Card: {
        paddingMedium: '0',
        borderColor: '#adadad',
        borderRadius: '0',
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
    <NCard hoverable class="h-full">
      <div class="h-full flex <lg:flex-col">
        <div
          :class="[
            'bg-[#2f2f2f]/86 flex grid-items-center justify-center w-20% min-w-120px',
            {
              'bg-gradient-to-b from-[#485a5c] to-[#1d0942]':
                showTrimed && medalData.isTrim,
            },
            '<lg:w-full <lg:py-2',
          ]"
        >
          <NImage
            v-bind="
              rarityImgStyleSet[medalData.rarity]?.[1]
                ? { width: rarityImgStyleSet[medalData.rarity]![1] }
                : {}
            "
            :src="`${TORAPPU_ENDPOINT}/assets/medal_icon/${showTrimed && medalData.isTrim ? medalData.trimId : medalData.id}.png`"
            show-toolbar-tooltip
            :previewed-img-props="{
              style: {
                padding: '20px',
                background: '#2f2f2fdb',
                borderRadius: '5px',
                justifyContent: 'center',
              },
            }"
          />
        </div>
        <div class="w-full flex flex-col divide-y!">
          <div
            :class="[
              'flex',
              'flex-row',
              'justify-between',
              'p-1.5! m-0! bg-gradient-to-r',
              rarityGradient[medalData.rarity],
              '<lg:p-0! <lg:px-1!',
            ]"
          >
            <h3 class="p-0 mt-0! <lg:pt-1!">
              <span
                :class="[
                  'px-1',
                  medalData.deprecate && showDeprecateBadge
                    ? 'color-gray-4 text-shadow-[0_0_5px_#fff,0_0_7px_#fff,0_0_3px_#fff]'
                    : 'color-white text-shadow-[0_0_5px_#0007,0_0_5px_#0007]',
                ]"
                >{{ medalData.name }}</span
              >
              <NBadge
                v-if="medalData.deprecate && showDeprecateBadge"
                value="绝版"
              />
            </h3>
            <div>
              <span
                v-for="i of medalData.rarity"
                :key="i"
                :class="[
                  'text-xl mdi mdi-star mdi-rotate-45 text-shadow-[2px_2px_5px_#0007,2px_2px_3px_#0002]',
                  rarityStarColor[medalData.rarity],
                ]"
              />
            </div>
          </div>
          <div
            class="flex grow items-center border-0 border-[#e5e7eb] border-solid align-middle p-2.5!"
          >
            <span
              class="whitespace-pre-wrap font-italic"
              v-html="medalData.desc"
            />
          </div>
          <div
            class="pos-relative border-0 border-[#e5e7eb] border-solid align-middle p-1.5!"
          >
            <div
              v-if="!medalData.decrypt"
              :class="[medalData.method ? '' : 'flex items-center']"
            >
              <NTag
                :color="{
                  color: '#565656',
                  textColor: 'white',
                  borderColor: '#565656',
                }"
                >获得方式</NTag
              ><span
                v-if="medalData.method"
                class="pl-1"
                v-html="medalData.method"
              ></span>
              <div v-else class="flex items-center pl-1">
                <div class="pr-1">获得</div>
                <template
                  v-for="miniMedal in medalData.preMedalList"
                  :key="miniMedal.id"
                >
                  <MiniMedalComponent
                    v-if="miniMedalData?.[miniMedal.id]"
                    :medal-data="miniMedalData[miniMedal.id]!"
                  />
                  <MiniMedalComponent
                    v-else
                    :medal-data="{
                      name: '',
                      picId: '',
                      method: '',
                      isTrim: false,
                    }"
                  />
                </template>
              </div>
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
                    class="border-[#565656] from-[#b2ebf2] to-[#d1c4e9] bg-gradient-to-b font-bold color-[#2f2f2f]!"
                    >镀层方式</NTag
                  >
                </template>
                点击切换显示{{ showTrimed ? "未镀层" : "镀层" }}章
              </NTooltip>
              <span class="pl-1">{{ medalData.trimMethod }}</span>
            </div>
            <div
              v-if="medalData.reward"
              class="pos-absolute right-1 top-50% flex transform-translate-y--50% items-center <lg:pos-unset <lg:transform-unset"
            >
              <NTag
                :color="{
                  color: '#ff7f27',
                  textColor: 'white',
                  borderColor: '#ff7f27',
                }"
                >随章奖励</NTag
              >
              <div v-for="reward in medalData.reward" :key="reward[0]">
                <NBadge
                  v-bind="reward[1] ? { value: reward[1] } : {}"
                  color="#2f2f2f"
                  :offset="['-1em', '3em']"
                  :show="!(reward[1] === '0' || reward[1] === '')"
                >
                  <NEl tag="a" :href="`/w/${reward[2]}`">
                    <img
                      v-if="reward[0]"
                      :src="getImagePath(reward[0])"
                      class="inline w-3.5em"
                    />
                  </NEl>
                </NBadge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </NCard>
  </NConfigProvider>
</template>
