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
  NLayout,
  NSpin,
  NTag,
  NTooltip,
} from "naive-ui";
import { storeToRefs } from "pinia";

import OptionsGroup from "@/components/OptionsGroup.vue";
import { useThemeStore } from "@/stores/theme";

import Equip from "./Equip.vue";
import FilterSub from "./FilterSub.vue";
import SubContainer from "./SubContainer.vue";
import { useCharStore } from "./charStore";
import { Char } from "./types";

export default defineComponent({
  components: {
    OptionsGroup,
    FilterSub,
    NCard,
    NCollapse,
    NCollapseItem,
    NConfigProvider,
    NLayout,
    NCollapseTransition,
    NTooltip,
    NEmpty,
    NButton,
    NTag,
    Equip,
    SubContainer,
  },
  setup() {
    const filterShow = ref(true);
    const operatorShow = ref(true);
    const andMode = ref(true);
    const themeStore = useThemeStore();
    const { theme } = storeToRefs(themeStore);
    const filterType = {
      title: "职业",
      options: ["先锋", "近卫", "重装", "狙击", "术师", "医疗", "辅助", "特种"],
    };
    const filterRarity = {
      title: "稀有度",
      options: ["4★", "5★", "6★"],
    };
    const rarityMap: Record<string, string> = {
      "3": "4★",
      "4": "5★",
      "5": "6★",
    };
    const subProfMap = ref<Record<string, string[]>>({});
    const filterSub = computed(() => {
      return {
        title: "子职业",
        options: Object.entries(subProfMap.value).map(([k, v]) => {
          return {
            type: "group",
            label: k,
            key: k,
            children: v.map((subProf) => {
              return {
                label: subProf,
                value: subProf,
              };
            }),
          };
        }),
      };
    });
    const equipChar = ref<string[]>([]);
    const charStore = useCharStore();
    const { selectedChar } = storeToRefs(charStore);
    const sortedCharData = ref<Record<string, Char[]>>({});
    const states = ref<Record<string, string[]>>({
      type: [],
      rarity: [],
      sub: [],
    });
    const filterIntersection = (states: Record<string, string[]>) => {
      return Object.fromEntries(
        Object.entries(sortedCharData.value)
          .filter(([k, v]) => {
            if (states.sub.length > 0 && !states.sub.includes(k)) return false;
            if (states.type.length > 0 && !states.type.includes(v[0].type))
              return false;
            return true;
          })
          .map(([k, v]) => {
            return [
              [k],
              v.filter((char) => {
                if (
                  states.rarity.length > 0 &&
                  !states.rarity.includes(rarityMap[char.rarity.toString()])
                )
                  return false;
                return true;
              }),
            ];
          })
          .filter(([k, v]) => v.length > 0),
      );
    };
    const filterUnion = (states: Record<string, string[]>) => {
      return Object.fromEntries(
        Object.entries(sortedCharData.value)
          .filter(([k, v]) => {
            if (
              (states.sub.length > 0 && states.sub.includes(k)) ||
              (states.type.length > 0 && states.type.includes(v[0].type))
            )
              return true;
            return false;
          })
          .map(([k, v]) => {
            return [
              [k],
              v.filter((char) => {
                if (
                  states.rarity.length > 0 &&
                  !states.rarity.includes(rarityMap[char.rarity.toString()])
                )
                  return false;
                return true;
              }),
            ];
          })
          .filter(([k, v]) => v.length > 0),
      );
    };
    const filteredCharData = computed<Record<string, Char[]>>(() => {
      return andMode.value
        ? filterIntersection(states.value)
        : filterUnion(states.value);
    });

    const toggleCollapse = () => {
      operatorShow.value = false;
      if (window.screen.availWidth < 1024) filterShow.value = false;
      equipChar.value = selectedChar.value.map((v) => v.name);
    };
    onMounted(async () => {
      const resp = await fetch(
        `/api.php?${new URLSearchParams({
          action: "ask",
          format: "json",
          query:
            "[[分类:拥有专属模组的干员]]|?子职业|?干员序号|?稀有度|?职业|sort=子职业|order=asc|limit=1000|link=none|link=none|sep=,|propsep=;|format=list",
          api_version: "2",
          utf8: "1",
        })}`,
      );
      const json = await resp.json();

      const charData = Object.entries<Record<string, any>>(
        json.query.results,
      ).map<Char>(([k, v]) => {
        return {
          name: k,
          type: v.printouts["职业"][0] as string,
          subtype: v.printouts["子职业"][0] as string,
          rarity: v.printouts["稀有度"][0] as string,
          id: v.printouts["干员序号"][0] as number,
        };
      });
      charData.forEach((char) => {
        if (!subProfMap.value[char.type]) subProfMap.value[char.type] = [];

        if (!sortedCharData.value[char.subtype])
          sortedCharData.value[char.subtype] = [];

        if (!~subProfMap.value[char.type].indexOf(char.subtype))
          subProfMap.value[char.type].push(char.subtype);

        sortedCharData.value[char.subtype].push(char);
      });

      Object.keys(sortedCharData.value).forEach((key) => {
        sortedCharData.value[key].sort((a: Char, b: Char) => {
          return a.rarity === b.rarity
            ? b.id - a.id
            : Number.parseInt(b.rarity as string) -
                Number.parseInt(a.rarity as string);
        });
      });
    });
    return {
      filterType,
      filterRarity,
      filterSub,
      states,
      filteredCharData,
      filterShow,
      operatorShow,
      andMode,
      selectedChar,
      charStore,
      equipChar,
      toggleCollapse,
      theme,
      themeStore,
    };
  },
});
</script>

<template>
  <NConfigProvider
    :theme="theme"
    preflight-style-disabled>
    <NLayout class="md:p-4 antialiased mx-auto lg:max-w-[90rem] max-w-3xl">
      <NCard title="干员筛选" header-style="text-align: center;" size="small">
        <template #header-extra>
          <div class="m-1" @click="themeStore.toggleDark()">
            <span v-if="theme" class="text-xl mdi mdi-brightness-6" />
            <span v-else class="text-xl mdi mdi-brightness-4" />
          </div>
          <NTooltip trigger="hover">
            <template #trigger>
              <div class="m-1" @click="andMode = !andMode">
                <span v-if="andMode" class="text-2xl mdi mdi-set-center" />
                <span v-else class="text-2xl mdi mdi-set-all" />
              </div>
            </template>
            点击改变筛选模式<br /><span
              class="mdi mdi-set-center"
            />：同时满足所有筛选条件<br /><span
              class="mdi mdi-set-all"
            />：满足职业和子职业的其中一个筛选条件
          </NTooltip>
          <div class="m-1" @click="filterShow = !filterShow">
            <span v-if="filterShow" class="text-2xl mdi mdi-chevron-up" />
            <span v-else class="text-2xl mdi mdi-chevron-down" />
          </div>
        </template>
        <NCollapseTransition :show="filterShow">
          <table class="w-full text-left border-collapse">
            <tbody class="align-baseline">
              <tr>
                <OptionsGroup
                  v-model="states.type"
                  :title="filterType.title"
                  :options="filterType.options"
                />
              </tr>
              <tr>
                <OptionsGroup
                  v-model="states.rarity"
                  :title="filterRarity.title"
                  :options="filterRarity.options"
                />
              </tr>
              <tr>
                <FilterSub
                  :title="filterSub.title"
                  :options="filterSub.options"
                  :selected="states.sub"
                />
              </tr>
            </tbody>
          </table>
        </NCollapseTransition>
      </NCard>
      <NCard>
        <div class="flex flex-row items-center">
          <NCard size="small">
            <NTag
              v-for="(char, ind) in selectedChar"
              :key="ind"
              class="m-1"
              type="info"
              closable
              @close="charStore.addOrDeleteChar(char)"
            >
              {{ char.name }}
            </NTag>
            <span v-if="selectedChar.length === 0" class="text-sm color-gray"
              >选中的干员在此显示，点击头像以选择干员</span
            >
          </NCard>
          <div class="flex flex-col lg:flex-row">
              <NButton
              class="m-1"
              strong
              secondary
              type="error"
              @click="
                () => {
                  selectedChar.splice(0);
                }
              "
            >
              <span class="text-xl mdi mdi-close-circle" />
            </NButton>
            <NButton
              class="m-1"
              strong
              secondary
              type="primary"
              @click="toggleCollapse"
            >
              <span class="text-xl mdi mdi-check-circle" />
            </NButton>
          </div>
        </div>
      </NCard>
      <NCard title="干员选择" header-style="text-align: center;" size="small">
        <template #header-extra>
          <div @click="operatorShow = !operatorShow">
            <span v-if="operatorShow" class="text-2xl mdi mdi-chevron-up" />
            <span v-else class="text-2xl mdi mdi-chevron-down" />
          </div>
        </template>
        <NCollapseTransition :show="operatorShow">
          <div class="w-full flex flex-col lg:flex-row flex-wrap">
            <SubContainer
              v-for="(chars, subtype) in filteredCharData"
              :key="subtype"
              :chars="chars"
              :title="subtype"
            />
          </div>
          <NEmpty
            v-if="Object.keys(filteredCharData).length == 0"
            description="无结果"
          >
            <template #icon>
              <span class="text-5xl mdi mdi-account-filter-outline" />
            </template>
          </NEmpty>
        </NCollapseTransition>
      </NCard>
      <NCard
        v-if="equipChar.length > 0"
        title="查询结果"
        header-style="text-align: center;"
        size="small"
      >
        <NCollapse>
          <NCollapseItem
            v-for="(name, ind) in equipChar"
            :key="ind"
            :name="name"
            :title="name"
            display-directive="if"
          >
            <Equip :name="name"></Equip>
          </NCollapseItem>
        </NCollapse>
      </NCard>
    </NLayout>
  </NConfigProvider>
</template>
