<script lang="ts">
import { computed, defineComponent, onMounted, ref } from "vue";

import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NCollapseTransition,
  NConfigProvider,
  NEmpty,
  NGrid,
  NGridItem,
  NLayout,
  NPopover,
  NText,
} from "naive-ui";

import OptionsGroup from "@/components/OptionsGroup.vue";
import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { getImagePath } from "@/utils/utils";

import MedalComponent from "./Medal.vue";
import MedalGroupComponent from "./MedalGroup.vue";
import MedalStats from "./MedalStats.vue";
import { getMedalMetaData } from "./utils";

import type { MedalMetaData } from "./types";
import type { CollapseProps } from "naive-ui";

export default defineComponent({
  components: {
    OptionsGroup,
    MedalStats,
    MedalComponent,
    MedalGroupComponent,
    NButton,
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
    NEmpty,
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
      const medalList = Object.keys(medal);
      const medalGroup = Object.fromEntries(
        Object.entries(medalMetaData.value.medalGroup).map(([key, group]) => {
          return [
            key,
            {
              ...group,
              medal: group.medal.filter((medalId) =>
                medalList.includes(medalId),
              ),
            },
          ];
        }),
      );
      const category = Object.fromEntries(
        Object.entries(medalMetaData.value.category).map(([key, cate]) => {
          return [
            key,
            {
              ...cate,
              medal: cate.medal.filter((medalId) =>
                medalList.includes(medalId),
              ),
            },
          ];
        }),
      );

      return {
        medal,
        medalGroup,
        category,
      };
    });
    const cateNums = computed(() => {
      return Object.fromEntries(
        Object.values(filteredMedalData.value.category).map((category) => {
          return [
            category.name,
            [
              category.medal.length,
              ...category.medalGroup.map(
                (groupId) =>
                  filteredMedalData.value.medalGroup[groupId].medal.length,
              ),
            ].reduce((a, b) => a + b, 0),
          ];
        }),
      );
    });
    const hiddenCatExpanded = ref(false);
    const hiddenCatUnlocked = ref(false);
    const collapseTitleChange: CollapseProps["onItemHeaderClick"] = ({
      name,
      expanded,
    }) => {
      hiddenCatExpanded.value = name === "加密奖章" && expanded;
    };
    const checkMedalExists = (medalId: string) => {
      return Object.keys(filteredMedalData.value.medal).includes(medalId);
    };
    const { theme, toggleDark } = useTheme();

    return {
      filterRarity,
      rarityMap,
      i18nConfig: getNaiveUILocale(),
      filterSpecial,
      states,
      showFilter,
      collapseTitleChange,
      hiddenCatExpanded,
      hiddenCatUnlocked,
      cateNums,
      filteredMedalData,
      checkMedalExists,
      theme,
      toggleDark,
      getImagePath,
    };
  },
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <NLayout class="antialiased mx-auto">
      <NCard>
        <template #header>
          <img
            :src="getImagePath('图标_光荣之路.svg')"
            :class="`${theme ? 'brightness-100' : 'brightness-0'} transition-all`"
            width="25"
          />&nbsp;&nbsp;光荣之路
        </template>
        <template #header-extra>
          <div class="mx-1 cursor-pointer" @click="toggleDark()">
            <span v-if="theme" class="text-2xl mdi mdi-brightness-6" />
            <span v-else class="text-2xl mdi mdi-brightness-4" />
          </div>
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
      <NCard size="small" content-style="padding: 0.5rem;">
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
            <NCard v-if="cate.extraDesc" class="mb-2">
              <div v-html="cate.extraDesc"></div>
            </NCard>
            <NGrid
              v-if="
                cate.name != '加密奖章' ||
                (cate.name == '加密奖章' && hiddenCatUnlocked)
              "
              cols="1 l:2"
              :x-gap="12"
              :y-gap="8"
              responsive="screen"
            >
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
              <NGridItem
                v-for="medalGroupId in cate.medalGroup.slice().reverse()"
                :key="medalGroupId"
              >
                <MedalGroupComponent
                  :group-data="filteredMedalData.medalGroup[medalGroupId]"
                  :medal-data-list="
                    filteredMedalData.medalGroup[medalGroupId].medal.map(
                      (id) => {
                        return filteredMedalData.medal[id];
                      },
                    )
                  "
                />
              </NGridItem>
              <NGridItem
                v-if="cate.medal.length === 0 && cate.medalGroup.length === 0"
                span="1 l:2"
              >
                <NEmpty>
                  <template #default>
                    <div class="text-center">
                      什么都没有 0.0<br />试着调整一下过滤器？
                    </div>
                  </template>
                </NEmpty>
              </NGridItem>
            </NGrid>
            <NGrid
              v-else
              cols="1 l:2"
              :x-gap="12"
              :y-gap="8"
              responsive="screen"
            >
              <NGridItem span="1 l:2">
                <NEmpty class="bg-#424242">
                  <template #icon>
                    <div class="text-center">
                      <span
                        class="mdi mdi-lock color-white p-0 font-size-2rem"
                      />
                    </div>
                  </template>
                  <template #default>
                    <div class="text-center color-white pt-2">
                      以下内容需要验证权限后查阅
                    </div>
                  </template>
                  <template #extra>
                    <div class="text-center color-white pb-2">
                      <NButton
                        color="white"
                        text-color="#424242"
                        @click="hiddenCatUnlocked = true"
                      >
                        <span class="mdi mdi-key-variant" />&nbsp;移除加密
                      </NButton>
                    </div>
                  </template>
                </NEmpty>
              </NGridItem>
            </NGrid>
            <!--
            <div
              v-for="medalGroupId in cate.medalGroup.slice().reverse()"
              :key="medalGroupId"
            >
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
            -->
          </NCollapseItem>
        </NCollapse>
      </NCard>
    </NLayout>
  </NConfigProvider>
</template>
