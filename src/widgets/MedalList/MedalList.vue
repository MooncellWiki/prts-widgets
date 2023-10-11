<script lang="ts">
import { defineComponent, onMounted, ref } from "vue";

import {
  NCard,
  NCol,
  NCollapse,
  NCollapseItem,
  NCollapseTransition,
  NConfigProvider,
  NGrid,
  NGridItem,
  NLayout,
  NNumberAnimation,
  NRow,
  NStatistic,
  NTooltip,
  zhCN,
} from "naive-ui";

import OptionsGroup from "@/components/OptionsGroup.vue";

import MedalComponent from "./Medal.vue";
import { getMedalMetaData, type MedalMetaData } from "./MedalMetaData";

export default defineComponent({
  components: {
    OptionsGroup,
    MedalComponent,
    NCard,
    NCollapse,
    NCollapseItem,
    NCollapseTransition,
    NConfigProvider,
    NLayout,
    NStatistic,
    NRow,
    NCol,
    NNumberAnimation,
    NTooltip,
    NGrid,
    NGridItem,
  },
  props: {},
  setup() {
    const staticData = ref<Record<string, number[]>>({
      star3: [0, 0],
      star2: [0, 0],
      star1: [0, 0],
      trim: [0, 0],
      all: [0, 0],
    });
    const medalMetaData = ref<MedalMetaData>({
      medal: {},
      medalGroup: {},
      category: {},
    });
    onMounted(async () => {
      medalMetaData.value = await getMedalMetaData();
      Object.values(medalMetaData.value.medal).forEach((medal) => {
        staticData.value.all[medal.decrypt ? 1 : 0] += 1;
        staticData.value[`star${medal.rarity}`][medal.decrypt ? 1 : 0] += 1;
        staticData.value.trim[medal.decrypt ? 1 : 0] += medal.isTrim ? 1 : 0;
      });
    });
    const showFilter = ref(true);
    const showSecretMedalStatic = ref(false);
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
    return {
      medalMetaData,
      zhCN,
      filterRarity,
      rarityMap,
      filterSpecial,
      states,
      showFilter,
      showSecretMedalStatic,
      staticData,
    };
  },
});
</script>

<template>
  <NConfigProvider preflight-style-disabled>
    <NLayout class="md:p-4 antialiased mx-auto lg:max-w-[90rem] max-w-3xl">
      <NCard title="光荣之路">
        <template #header-extra>
          <div class="m-1 cursor-pointer" @click="showFilter = !showFilter">
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
      <NCard title="蚀刻章统计">
        <template #header-extra>
          <NTooltip trigger="hover">
            <template #trigger>
              <div
                class="m-1 cursor-pointer"
                @click="showSecretMedalStatic = !showSecretMedalStatic"
              >
                <span
                  v-if="showSecretMedalStatic"
                  class="text-2xl mdi mdi-eye"
                />
                <span v-else class="text-2xl mdi mdi-eye-off" />
              </div>
            </template>
            ? ? ?
          </NTooltip>
        </template>
        <NRow>
          <NCol :span="6">
            <NStatistic label="已有蚀刻章" :tabular-nums="true">
              <NNumberAnimation
                active
                :from="showSecretMedalStatic ? staticData.all[0] : 0"
                :to="
                  staticData.all[0] +
                  (showSecretMedalStatic ? staticData.all[1] : 0)
                "
                show-separator
              />
              <template #suffix> 枚 </template>
            </NStatistic>
          </NCol>
          <NCol :span="6">
            <NStatistic label="3★蚀刻章" :tabular-nums="true">
              <NNumberAnimation
                active
                :from="showSecretMedalStatic ? staticData.star3[0] : 0"
                :to="
                  staticData.star3[0] +
                  (showSecretMedalStatic ? staticData.star3[1] : 0)
                "
                show-separator
              />
              <template #suffix> 枚 </template>
            </NStatistic>
          </NCol>
          <NCol :span="6">
            <NStatistic label="2★蚀刻章" :tabular-nums="true">
              <NNumberAnimation
                active
                :from="showSecretMedalStatic ? staticData.star2[0] : 0"
                :to="
                  staticData.star2[0] +
                  (showSecretMedalStatic ? staticData.star2[1] : 0)
                "
                show-separator
              />
              <template #suffix> 枚 </template>
            </NStatistic>
          </NCol>
          <NCol :span="6">
            <NStatistic label="1★蚀刻章" :tabular-nums="true">
              <NNumberAnimation
                active
                :from="showSecretMedalStatic ? staticData.star1[0] : 0"
                :to="
                  staticData.star1[0] +
                  (showSecretMedalStatic ? staticData.star1[1] : 0)
                "
                show-separator
              />
              <template #suffix> 枚 </template>
            </NStatistic>
          </NCol>
        </NRow>
        <NRow>
          <NCol :span="6">
            <NStatistic label="镀层蚀刻章" :tabular-nums="true">
              <NNumberAnimation
                active
                :from="showSecretMedalStatic ? staticData.trim[0] : 0"
                :to="
                  staticData.trim[0] +
                  (showSecretMedalStatic ? staticData.trim[1] : 0)
                "
                show-separator
              />
              <template #suffix> 枚 </template>
            </NStatistic>
          </NCol>
          <NCol :span="6">
            <NStatistic
              v-if="showSecretMedalStatic"
              label="3★加密蚀刻章"
              :tabular-nums="true"
            >
              <NNumberAnimation
                active
                :from="0"
                :to="staticData.star3[1]"
                show-separator
              />
              <template #suffix> 枚 </template>
            </NStatistic>
          </NCol>
          <NCol :span="6">
            <NStatistic
              v-if="showSecretMedalStatic"
              label="2★加密蚀刻章"
              :tabular-nums="true"
            >
              <NNumberAnimation
                active
                :from="0"
                :to="staticData.star2[1]"
                show-separator
              />
              <template #suffix> 枚 </template>
            </NStatistic>
          </NCol>
          <NCol :span="6">
            <NStatistic
              v-if="showSecretMedalStatic"
              label="1★加密蚀刻章"
              :tabular-nums="true"
            >
              <NNumberAnimation
                active
                :from="0"
                :to="staticData.star1[1]"
                show-separator
              />
              <template #suffix> 枚 </template>
            </NStatistic>
          </NCol>
        </NRow>
        <template #action>
          <p>
            <span class="mdi mdi-information-variant-circle" />
            可能包含暂未实装进入游戏的蚀刻章
          </p>
        </template>
      </NCard>
      <NCard>
        <NCollapse>
          <NCollapseItem
            v-for="cate in medalMetaData.category"
            :key="cate.name"
            :title="cate.name"
          >
            <template #header-extra>
              {{ cate.desc }}
            </template>
            <!--<div v-for="medalId in cate.medal"> {{ medalMetaData.medal[medalId].name }} </div>-->
            <NGrid cols="1 l:2" responsive="screen">
              <NGridItem v-for="medalId in cate.medal" :key="medalId">
                <MedalComponent :medal-data="medalMetaData.medal[medalId]">
                </MedalComponent>
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
