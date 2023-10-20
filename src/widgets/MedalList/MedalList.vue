<script lang="ts">
import { defineComponent, onMounted, ref, computed } from "vue";

import type { CollapseProps } from "naive-ui";
import {
  NCard,
  NCollapse,
  NCollapseItem,
  NCollapseTransition,
  NConfigProvider,
  NGrid,
  NGridItem,
  NLayout,
  NPopover,
  NText,
} from "naive-ui";

import OptionsGroup from "@/components/OptionsGroup.vue";

import MedalComponent from "./Medal.vue";
import MedalStats from "./MedalStats.vue";
import type { MedalMetaData } from "./types";
import { getMedalMetaData } from "./utils";

export default defineComponent({
  components: {
    OptionsGroup,
    MedalStats,
    MedalComponent,
    NCard,
    NCollapse,
    NPopover,
    NCollapseItem,
    NCollapseTransition,
    NConfigProvider,
    NLayout,
    NGrid,
    NGridItem,
    NText,
  },
  setup() {
    const medalMetaData = ref<MedalMetaData>({
      medal: {},
      medalGroup: {},
      category: {},
    });
    const cateNums = computed(() => {
      return Object.fromEntries(
        Object.values(medalMetaData.value.category).map((category) => {
          return [
            category.name,
            category.medal.length +
              category.medalGroup
                .map(
                  (groupId) =>
                    medalMetaData.value.medalGroup[groupId].medal.length,
                )
                .reduce((a, b) => a + b, 0),
          ];
        }),
      );
    });

    onMounted(async () => {
      medalMetaData.value = await getMedalMetaData();
    });
    const showFilter = ref(true);
    const filterRarity = {
      title: "稀有度",
      options: ["★", "★★", "★★★"],
    };
    const rarityMap: Record<string, string> = {
      "1": "★",
      "2": "★★",
      "3": "★★★",
    };
    const filterSpecial = {
      title: "特殊选择",
      options: ["有镀层"],
    };
    const states = ref<Record<string, string[]>>({
      rarity: [],
      special: [],
    });
    const hiddenCatExpanded = ref(false);
    const collapseTitleChange: CollapseProps["onItemHeaderClick"] = ({
      name,
      expanded,
    }) => {
      if (name == "加密奖章") {
        if (expanded) {
          hiddenCatExpanded.value = true;
        } else {
          hiddenCatExpanded.value = false;
        }
      }
    };
    return {
      medalMetaData,
      filterRarity,
      rarityMap,
      filterSpecial,
      states,
      showFilter,
      collapseTitleChange,
      hiddenCatExpanded,
      cateNums,
    };
  },
});
</script>

<template>
  <NConfigProvider preflight-style-disabled>
    <NLayout class="md:p-4 antialiased mx-auto lg:max-w-[90rem] max-w-3xl">
      <NCard title="光荣之路">
        <template #header-extra>
          <div class="mx-1 cursor-pointer">
            <NPopover trigger="click" raw>
              <template #trigger>
                <span class="text-2xl mdi mdi-chart-bar" />
              </template>
              <MedalStats :medal-meta-data="medalMetaData" />
            </NPopover>
          </div>
          <div class="mx-1 cursor-pointer" @click="showFilter = !showFilter">
            <span v-if="showFilter" class="text-2xl mdi mdi-chevron-up" />
            <span v-else class="text-2xl mdi mdi-chevron-down" />
          </div>
        </template>
        <NCollapseTransition :show="showFilter">
          <table class="w-full text-left border-collapse">
            <tbody class="align-baseline">
              <tr>
                <OptionsGroup
                  v-model="states.rarity"
                  :title="filterRarity.title"
                  :options="filterRarity.options"
                />
              </tr>
              <tr>
                <OptionsGroup
                  v-model="states.special"
                  :title="filterSpecial.title"
                  :options="filterSpecial.options"
                />
              </tr>
            </tbody>
          </table>
        </NCollapseTransition>
      </NCard>
      <NCard>
        <NCollapse @item-header-click="collapseTitleChange">
          <NCollapseItem
            v-for="cate in medalMetaData.category"
            :key="cate.name"
            :name="cate.name"
          >
            <template #header>
              <NText v-if="cate.name != '加密奖章'" type="default" tag="span">
                {{ `${cate.name} (${cateNums[cate.name]})` }}
              </NText>
              <NText v-else type="warning" tag="b">
                {{
                  hiddenCatExpanded
                    ? `${cate.name} (${cateNums[cate.name]})`
                    : "？？？(??)"
                }}
              </NText>
            </template>
            <template #header-extra>
              {{ cate.desc }}
            </template>
            <NCard v-if="cate.extraDesc">
              <div v-html="cate.extraDesc"></div>
            </NCard>
            <NGrid cols="1 l:2" responsive="screen">
              <NGridItem v-for="medalId in cate.medal" :key="medalId">
                <MedalComponent :medal-data="medalMetaData.medal[medalId]" />
              </NGridItem>
            </NGrid>
            <div v-for="medalGroupId in cate.medalGroup" :key="medalGroupId">
              【套组】{{ medalMetaData.medalGroup[medalGroupId].name }}<br />{{
                medalMetaData.medalGroup[medalGroupId].desc
              }}
              <div
                v-for="medalId in medalMetaData.medalGroup[medalGroupId].medal"
                :key="medalId"
              >
                {{ medalMetaData.medal[medalId].name }}
              </div>
            </div>
          </NCollapseItem>
        </NCollapse>
      </NCard>
    </NLayout>
  </NConfigProvider>
</template>
