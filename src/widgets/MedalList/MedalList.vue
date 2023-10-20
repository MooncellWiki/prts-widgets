<script lang="ts">
import { computed, defineComponent, onMounted, ref } from "vue";

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
    const filteredMedalData = computed(() => {
      const medal = Object.fromEntries(
        Object.entries(medalMetaData.value.medal).filter(([, medal]) => {
          if (
            states.value.rarity.length > 0 &&
            states.value.rarity.length < filterRarity.options.length &&
            !states.value.rarity.includes(rarityMap[medal.rarity.toString()])
          ) {
            return false;
          }
          if (states.value.special.includes("有镀层")) {
            return medal.isTrim;
          }

          return true;
        }),
      );
      const category = Object.fromEntries(
        Object.entries(medalMetaData.value.category).map(([key, cate]) => {
          return [
            key,
            {
              ...cate,
              medal: cate.medal.filter((medalId) =>
                Object.keys(medal).includes(medalId),
              ),
            },
          ];
        }),
      );

      return {
        medal,
        medalGroup: medalMetaData.value.medalGroup,
        category,
      };
    });
    const cateNums = computed(() => {
      return Object.fromEntries(
        Object.values(filteredMedalData.value.category).map((category) => {
          return [
            category.name,
            category.medal.length +
              category.medalGroup
                .map(
                  (groupId) =>
                    filteredMedalData.value.medalGroup[groupId].medal.length,
                )
                .reduce((a, b) => a + b, 0),
          ];
        }),
      );
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
    const checkMedalExists = (medalId: string) => {
      return Object.keys(filteredMedalData.value.medal).includes(medalId);
    };

    return {
      filterRarity,
      rarityMap,
      filterSpecial,
      states,
      showFilter,
      collapseTitleChange,
      hiddenCatExpanded,
      cateNums,
      filteredMedalData,
      checkMedalExists,
    };
  },
});
</script>

<template>
  <NConfigProvider preflight-style-disabled>
    <NLayout class="antialiased mx-auto">
      <NCard title="光荣之路">
        <template #header-extra>
          <div class="mx-1 cursor-pointer">
            <NPopover trigger="click" raw>
              <template #trigger>
                <span class="text-2xl mdi mdi-chart-bar" />
              </template>
              <MedalStats :medal-meta-data="filteredMedalData" />
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
            v-for="cate in filteredMedalData.category"
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
              <span class="<lg:hidden">{{ cate.desc }}</span>
            </template>
            <span class="lg:hidden p-1">{{ cate.desc }}</span>
            <NCard v-if="cate.extraDesc">
              <div v-html="cate.extraDesc"></div>
            </NCard>
            <NGrid cols="1 l:2" :x-gap="12" :y-gap="8" responsive="screen">
              <NGridItem
                v-for="medalId in cate.medal.filter((medalId) =>
                  checkMedalExists(medalId),
                )"
                :key="medalId"
              >
                <MedalComponent
                  :medal-data="filteredMedalData.medal[medalId]"
                />
              </NGridItem>
            </NGrid>
            <div v-for="medalGroupId in cate.medalGroup" :key="medalGroupId">
              【套组】{{ filteredMedalData.medalGroup[medalGroupId].name
              }}<br />{{ filteredMedalData.medalGroup[medalGroupId].desc }}
              <div
                v-for="medalId in filteredMedalData.medalGroup[
                  medalGroupId
                ].medal.filter((medalId) => checkMedalExists(medalId))"
                :key="medalId"
              >
                {{ filteredMedalData.medal[medalId].name }}
              </div>
            </div>
          </NCollapseItem>
        </NCollapse>
      </NCard>
    </NLayout>
  </NConfigProvider>
</template>
