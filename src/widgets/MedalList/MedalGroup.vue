<script setup lang="ts">
import { computed, ref } from "vue";

import {
  NButton,
  NCard,
  NConfigProvider,
  NDropdown,
  NImage,
  NCollapse,
  NCollapseItem,
  NTooltip,
} from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";

import MedalComponent from "./Medal.vue";

import type { Medal, MedalGroup } from "./types";

function goToLink(link: string) {
  window.open(`https://prts.wiki/w/${link}`, "_blank");
}
const props = withDefaults(
  defineProps<{
    groupData: MedalGroup;
    medalDataList: Medal[];
    showDeprecateBadge?: boolean;
    deprecateText?: string;
  }>(),
  {
    showDeprecateBadge: true,
  },
);

const eventLinkList = computed(() => {
  return props.groupData.bindEvent.slice(1).map((value, index) => {
    return {
      label: props.groupData.bindEvent[0] + (index > 0 ? " 复刻" : ""),
      key: value,
    };
  });
});

const showTrimed = ref(false);
</script>

<template>
  <NConfigProvider
    v-if="medalDataList.length > 0"
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
      Collapse: {
        itemMargin: '0',
        titlePadding: '0.5em',
      },
    }"
  >
    <NCard class="h-full">
      <div class="h-full flex flex-col <lg:flex-col">
        <div
          class="flex justify-between bg-gradient-to-r m-0! <lg:flex-row p-2.5! <lg:p-1!"
          :style="{
            background: groupData.background || 'black',
          }"
        >
          <h3
            class="p-0 px-1 pr-2 color-white mt-0! <lg:text-size-sm <lg:p-0! <lg:px-2! <lg:pt-1!"
          >
            <span :style="groupData.textStyle || { color: 'white' }">
              <span
                v-if="groupData.customText"
                v-html="groupData.customText"
              ></span>
              <span v-else>{{ groupData.name }}</span>
            </span>
          </h3>
          <div class="flex flex-row">
            <div v-if="groupData.isTrim">
              <NButton
                size="small"
                class="color-white!"
                :color="showTrimed ? '#637cad' : '#000'"
                @click="showTrimed = !showTrimed"
              >
                <div>
                  <span
                    :class="[
                      'mdi',
                      `mdi-chevron-up-circle${showTrimed ? '' : '-outline'}`,
                    ]"
                  />
                  <span class="<lg:hidden"> 切换镀层</span>
                </div>
              </NButton>
            </div>
            <div v-if="groupData.bindEvent.length <= 2" class="ml-1">
              <NTooltip trigger="hover" placement="bottom-end">
                <template #trigger>
                  <NButton
                    v-if="groupData.bindEvent[1]"
                    size="small"
                    color="#2f2f2f"
                    class="color-white! focus:decoration-none hover:decoration-none"
                    @click="goToLink(groupData.bindEvent[1])"
                  >
                    <div>
                      <span class="mdi mdi-flag-variant" />
                      <span class="<lg:hidden"> 前往活动</span>
                    </div>
                  </NButton>
                </template>
                前往活动：{{ groupData.bindEvent[0] }}
              </NTooltip>
            </div>
            <div v-else class="ml-1">
              <NDropdown
                show-arrow
                trigger="hover"
                :options="eventLinkList"
                placement="bottom-end"
                @select="goToLink"
              >
                <NButton
                  size="small"
                  color="#2f2f2f"
                  class="color-white! focus:decoration-none hover:decoration-none"
                >
                  <div>
                    <span class="mdi mdi-flag-variant" />
                    <span class="<lg:hidden"> 前往活动</span>
                    <span class="mdi mdi-plus lg:hidden" />
                  </div>
                </NButton>
              </NDropdown>
            </div>
          </div>
        </div>
        <div
          v-if="groupData.deprecateType && showDeprecateBadge"
          :class="[
            'hidden <lg:block!',
            'w-100% px-2 py-0.5 color-white font-bold text-size-xs!',
            'bg-orange-5',
            '<lg:p-0',
          ]"
        >
          <span class="mdi mdi-vanish" />
          {{ deprecateText }}
        </div>
        <div class="pos-relative max-w-full flex">
          <div
            v-if="groupData.deprecateType && showDeprecateBadge"
            :class="[
              'pos-absolute <lg:hidden',
              'w-[calc(100%-1rem)] px-2 py-0.5 color-white font-bold',
              'bg-orange-5 bg-opacity-80',
            ]"
          >
            <span class="mdi mdi-vanish" />
            {{ deprecateText }}
          </div>
          <NImage
            :src="`${TORAPPU_ENDPOINT}/assets/medal_diy/${(showTrimed && groupData.isTrim ? 'trim/' : '') + groupData.id}.png`"
            :img-props="{
              style: {
                width: '100%',
              },
            }"
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
        <div
          class="whitespace-pre-wrap p-1 text-center italic <lg:text-xs"
          :style="{
            background: `linear-gradient(180deg, ${groupData.color}5c, transparent)`,
          }"
          v-html="groupData.desc"
        />
        <NCollapse arrow-placement="right">
          <NCollapseItem class="p-1 m-0!">
            <template #header>
              <div class="flex flex-row">
                <div>共 {{ groupData.medal.length }} 枚，展开套组</div>
                <div
                  v-if="groupData.hasChangedInRetro"
                  class="ml-1 bg-bluegray-6 px-1 py-0.5 text-xs color-white font-bold"
                >
                  <span class="mdi mdi-information-outline" />
                  复刻时获取条件调整
                </div>
              </div>
            </template>
            <div class="flex flex-col gap-1">
              <div v-for="(medal, i) in medalDataList" :key="i">
                <MedalComponent
                  :medal-data="medal"
                  :show-deprecate-badge="showDeprecateBadge"
                />
              </div>
            </div>
          </NCollapseItem>
        </NCollapse>
      </div>
    </NCard>
  </NConfigProvider>
</template>
