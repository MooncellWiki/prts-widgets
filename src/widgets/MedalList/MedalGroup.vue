<script lang="ts">
import { computed, defineComponent, ref, type PropType } from "vue";

import {
  NButton,
  NCard,
  NConfigProvider,
  NDropdown,
  NImage,
  DropdownOption,
  NCollapse,
  NCollapseItem,
  NTooltip,
} from "naive-ui";

import { getImagePath } from "../../utils/utils";

import MedalComponent from "./Medal.vue";
import type { Medal, MedalGroup } from "./types";

export default defineComponent({
  components: {
    NButton,
    NConfigProvider,
    NCard,
    NDropdown,
    NImage,
    NCollapse,
    NCollapseItem,
    NTooltip,
    MedalComponent,
  },
  props: {
    groupData: {
      type: Object as PropType<MedalGroup>,
      required: true,
    },

    medalDataList: {
      type: Array<Medal>,
      required: true,
    },
  },
  setup(props) {
    const eventLinkList = computed(() => {
      return props.groupData.bindEvent.slice(1).map((value, index) => {
        return {
          label: props.groupData.bindEvent[0] + (index > 0 ? " 复刻" : ""),
          key: value,
        } as DropdownOption;
      });
    });

    function goToLink(link: string) {
      window.open("https://prts.wiki/w/" + link, "_blank");
    }

    return {
      eventLinkList,
      getImagePath,
      goToLink,
      showTrimed: ref(false),
      showGroupDetail: ref(false),
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
        borderColor: '#adadad',
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
    <NCard v-if="medalDataList.length > 0">
      <div class="flex flex-col <lg:flex-col">
        <div
          :class="[
            'flex <lg:flex-col',
            'justify-between',
            'p-2.5! m-0! bg-gradient-to-r',
            'text-shadow-lg',
          ]"
          :style="{
            background: groupData.background || 'black',
          }"
        >
          <h3 class="color-white p-0 px-1 pr-2 mt-0!">
            <span :style="groupData.textStyle || 'color:white;'">
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
                :color="showTrimed ? '#637cad' : '#000'"
                @click="showTrimed = !showTrimed"
              >
                <div>
                  <span
                    :class="[
                      'mdi',
                      'mdi-chevron-up-circle' + (showTrimed ? '' : '-outline'),
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
                    size="small"
                    color="#2f2f2f"
                    tag="a"
                    class="visited:color-none color-white! hover:decoration-none focus:decoration-none"
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
                <NButton size="small" color="#2f2f2f">
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
          v-if="groupData.deprecateType"
          class="bg-orange-5 color-white px-2 py-0.5 font-bold"
        >
          <span class="mdi mdi-vanish" />
          <span v-if="groupData.deprecateType == 'CC'">
            危机合约套组：不复刻
          </span>
          <span v-if="groupData.deprecateType == 'retro'">
            已复刻过的活动：无法再获得本蚀刻章套组
          </span>
        </div>
        <div class="flex max-w-full">
          <NImage
            :src="`/images/${getImagePath(
              `蚀刻章套组_${groupData.alias}${
                showTrimed && groupData.isTrim ? '_镀层' : ''
              }.png`,
            )}`"
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
          class="italic whitespace-pre-wrap p-1 text-center <lg:font-size-1"
          :style="{
            background: `linear-gradient(180deg, ${groupData.color}5c, transparent)`,
          }"
          v-html="groupData.desc"
        ></div>
        <NCollapse
          arrow-placement="right"
          @item-header-click="showGroupDetail = !showGroupDetail"
        >
          <NCollapseItem class="m-3!">
            <template #header>
              <div class="flex flex-row <lg:flex-col">
                <div>共 {{ groupData.medal.length }} 枚，展开套组</div>
                <div
                  v-if="groupData.hasChangedInRetro"
                  class="bg-bluegray-6 color-white ml-1 <lg:ml-0 px-1 py-0.5 font-bold font-size-1"
                >
                  <span class="mdi mdi-information-outline" />
                  复刻时获取条件调整
                </div>
              </div>
            </template>
            <div
              v-for="(medal, i) in medalDataList"
              :key="i"
              :class="showGroupDetail ? 'm-2 mb-0 <lg:m-0 <lg:mb-2' : ''"
            >
              <MedalComponent :medal-data="medal" />
            </div>
          </NCollapseItem>
        </NCollapse>
      </div>
    </NCard>
  </NConfigProvider>
</template>
