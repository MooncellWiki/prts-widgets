<script setup lang="ts">
import { computed, onBeforeMount, provide, ref } from "vue";

import {
  NButton,
  NButtonGroup,
  NCard,
  NCollapseTransition,
  NConfigProvider,
  NInput,
  NLayout,
  NScrollbar,
  NSelect,
} from "naive-ui";

import OptionsGroup from "@/components/OptionsGroup.vue";
import { getLanguage, getNaiveUILocale, LANGUAGES } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { isMobile } from "@/utils/utils";

import EquipGroup from "./components/EquipGroup.vue";
import EquipTable from "./components/EquipTable.vue";
import FilterSub from "./components/FilterSub.vue";
import { rarityMap, statsStyleMap } from "./consts";
import {
  askOperators,
  getEquipAddedTime,
  getEquipDataAll,
  getSubtypeMap,
} from "./equipData";
import {
  customLabel,
  getFilterOptions,
  getFilterRarity,
  getFilterType,
  getFilterValue,
  getLocaleType,
  getSortOptions,
  getZhType,
} from "./i18n";

import type { CharEquips, EquipRow } from "./types";

interface FilterValue {
  mode: string;
  value: string | string[];
}
function newFilterItem(): FilterValue {
  return {
    mode: "all",
    value: "yes",
  };
}

function newSortItem(): FilterValue {
  return {
    mode: "desc",
    value: "desc",
  };
}

const i18nConfig = getNaiveUILocale();
const { theme, toggleDark } = useTheme();
const locale = getLanguage();
const timeData = ref<
  {
    label: string;
    value: string;
  }[]
>([]);
const filterShow = ref(true);
const equipFilterShow = ref(true);
const listShow = ref(true);
const showEquips = ref<string[]>([]);
provide("showEquips", showEquips);
const loadingCount = ref(0);
provide("loadingCount", loadingCount);

const subProfMap = ref<Record<string, string[]>>({});
const filteredSubProfMap = computed(() => {
  const map: Record<string, string[]> = {};
  const typeArray = states.value.type;
  if (!typeArray || typeArray.length === 0) return subProfMap.value;
  for (const t of typeArray) {
    const zhType = getZhType(t, locale);
    if (!zhType) continue;
    const subProfs = subProfMap.value[zhType];
    if (subProfs) {
      map[zhType] = subProfs;
    }
  }
  return map;
});

const subOptions = computed(() => {
  const cLabel = customLabel[locale];
  const zhLabel = customLabel[LANGUAGES.ZH];
  const subtypeMap = cLabel.subtypeMap;
  return {
    title: cLabel.subtypeLabel,
    placeholder: cLabel.subPlaceholder,
    options: Object.entries(filteredSubProfMap.value).map(([k, v]) => {
      return {
        type: "group",
        label: cLabel.typeOptions[zhLabel.typeOptions.indexOf(k)] ?? k,
        key: k,
        children: v.map((subProf) => {
          return {
            label: subtypeMap?.[subProf] ?? subProf,
            value: subProf,
          };
        }),
      };
    }),
  };
});
const options = {
  type: getFilterType(locale),
  rarity: getFilterRarity(locale),
};
const sortOptions = {
  sortOption: getSortOptions(locale),
  filterOption: getFilterOptions(locale),
};
const states = ref<Record<string, string[]>>({
  type: [],
  rarity: [],
  sub: [],
});
const sortStates = ref<Record<string, FilterValue[]>>({
  filter: [newFilterItem()],
  sort: [newSortItem()],
});
const group = ref("sub");
const simple = ref("stats");
provide("simple", simple);

const rawEquipData = ref<CharEquips[]>([]);
const filterData = (data: DOMStringMap): boolean => {
  const filterArray = sortStates.value.filter;
  if (!filterArray) return true;
  return filterArray.every((v) => {
    switch (v.mode) {
      case "all": {
        return true;
      }
      case "trait": {
        const { add } = data;

        return v.value === "yes" ? !!add : !add;
      }
      case "type": {
        const { type } = data;
        const match = !!type?.match(new RegExp(`-${v.value}`, "i"));
        const nmatch = !type?.match(/-[xyαδ]/i);

        return v.value === "o" ? nmatch : match;
      }
      case "talent": {
        const { talent2 = "", talent3 = "" } = data;
        const match =
          talent2.includes("新增天赋") || talent3.includes("新增天赋");

        return v.value === "yes" ? match : !match;
      }
      case "addtime": {
        return v.value.includes(data[v.mode]!);
      }
      case "mission2opt": {
        if (typeof v.value !== "string") return false;

        return !!data[v.mode]?.includes(v.value);
      }
      default: {
        return v.value === "yes" ? data[v.mode] !== "0" : data[v.mode] === "0";
      }
    }
  });
};
const filteredEquipData = computed((): CharEquips[] => {
  const s = states.value;
  const result: CharEquips[] = [];
  for (const ce of rawEquipData.value) {
    const rarityArray = s.rarity;
    const subArray = s.sub;
    const typeArray = s.type;

    const rarityP =
      rarityArray &&
      rarityArray.length > 0 &&
      !rarityArray.includes(rarityMap[ce.char.rarity.toString()] ?? "");
    const subP =
      subArray && subArray.length > 0 && !subArray.includes(ce.char.subtype);
    const typeP =
      typeArray &&
      typeArray.length > 0 &&
      !typeArray.includes(getLocaleType(ce.char.type, locale) ?? "");
    if (rarityP || subP || typeP) continue;
    const data = ce.equips.filter((e) => filterData(e));
    if (data.length > 0)
      result.push({
        char: ce.char,
        equips: data,
      });
  }
  return result;
});
const CharEquipList = computed(() => {
  const result: EquipRow[] = [];
  for (const ce of filteredEquipData.value) {
    result.push(
      ...ce.equips.map((e) => {
        return {
          name: e.name ?? "",
          type: e.type ?? "",
          operator: ce.char.name,
          oprarity: ce.char.rarity,
          opid: ce.char.id,
          data: e,
        };
      }),
    );
  }
  const sortArray = sortStates.value.sort;
  if (!sortArray || sortArray.length === 0) return result;

  result.sort((x, y) => {
    const sortMode = sortArray[0];
    if (!sortMode) return 0;

    switch (sortMode.mode) {
      case "default": {
        return x.oprarity === y.oprarity
          ? y.opid - x.opid
          : Number.parseInt(y.oprarity as string) -
              Number.parseInt(x.oprarity as string);
      }
      case "asc": {
        return x.data.addtime === y.data.addtime
          ? y.opid - x.opid
          : Number.parseInt(x.data.addtime ?? "0") -
              Number.parseInt(y.data.addtime ?? "0");
      }
      case "desc": {
        return x.data.addtime === y.data.addtime
          ? y.opid - x.opid
          : Number.parseInt(y.data.addtime ?? "0") -
              Number.parseInt(x.data.addtime ?? "0");
      }
      default: {
        const mode = sortMode.mode;
        const order = sortMode.value === "asc" ? 1 : -1;
        const numx = x.data[`${mode}3`] ? Number(x.data[`${mode}3`]) : 0;
        const numy = y.data[`${mode}3`] ? Number(y.data[`${mode}3`]) : 0;
        return numx === numy
          ? y.opid - x.opid
          : (numx - numy) * order * (statsStyleMap[mode] ?? 1);
      }
    }
  });
  return result;
});

onBeforeMount(async () => {
  loadingCount.value = 1;
  const [json, equips, time, subm] = await Promise.all([
    askOperators(),
    getEquipDataAll(),
    getEquipAddedTime(),
    getSubtypeMap(),
  ]);

  const charData = Object.entries<Record<string, any>>(
    json.query.results,
  ).map<CharEquips>(([k, v]) => {
    return {
      char: {
        name: k,
        nameEN: v.printouts["干员外文名"][0] as string,
        nameJP: v.printouts["干员名jp"][0] as string,
        type: v.printouts["职业"][0] as string,
        subtype: v.printouts["子职业"][0] as string,
        rarity: v.printouts["稀有度"][0] as string,
        id: v.printouts["干员序号"][0] as number,
      },
      equips: equips[k]
        ? equips[k]
            .map((e) => {
              const t = time.find((et) => {
                return et.equips.some((i) => {
                  return i.char === k && i.name === e.name!;
                });
              })?.time;
              e.addtime = t?.toString() || "0";
              e.latest = time.at(-1)?.time === t ? "yes" : "no";
              return e;
            })
            .sort((a, b) => {
              const atail = (a.type?.match(/-(.*)/i) ?? [])[1] ?? "";
              const btail = (b.type?.match(/-(.*)/i) ?? [])[1] ?? "";
              if (atail === btail) return 0;
              if (btail !== "X" && btail !== "Y") return -1;
              if (atail === "X" && btail === "Y") return -1;
              return 1;
            })
        : [],
    };
  });
  for (const i of charData) {
    const typeKey = i.char.type;
    const subProfArray = subProfMap.value[typeKey];
    if (!subProfArray) {
      subProfMap.value[typeKey] = [];
    }
    const currentArray = subProfMap.value[typeKey];
    if (currentArray && !~currentArray.indexOf(i.char.subtype)) {
      currentArray.push(i.char.subtype);
    }
  }
  rawEquipData.value = charData;
  timeData.value = time.map((i) => {
    return {
      label: new Date(i.time * 1000).toLocaleDateString(locale),
      value: i.time.toString(),
    };
  });
  customLabel.en.subtypeMap = subm.en;
  customLabel.ja.subtypeMap = subm.ja;
  customLabel.ko.subtypeMap = subm.ko;
  customLabel["zh-tw"].subtypeMap = subm["zh-tw"];
  loadingCount.value = 0;
});

const mobileStyle = () => {
  return isMobile() ? "padding: 5px" : undefined;
};
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
    preflight-style-disabled
  >
    <NLayout class="mx-auto max-w-3xl antialiased lg:max-w-[90rem] md:p-4">
      <NCard
        :title="customLabel[locale].filterTitle"
        header-style="text-align: center;"
        size="small"
      >
        <template #header-extra>
          <div class="m-1 cursor-pointer" @click="toggleDark()">
            <span v-if="theme" class="mdi mdi-brightness-6 text-2xl" />
            <span v-else class="mdi mdi-brightness-4 text-2xl" />
          </div>
          <div class="m-1 cursor-pointer" @click="filterShow = !filterShow">
            <span v-if="filterShow" class="mdi mdi-chevron-up text-2xl" />
            <span v-else class="mdi mdi-chevron-down text-2xl" />
          </div>
        </template>
        <NCollapseTransition :show="filterShow">
          <table class="w-full border-collapse text-left">
            <tbody class="align-baseline">
              <tr>
                <OptionsGroup
                  :model-value="states.type"
                  :title="options.type.title"
                  :options="options.type.options"
                  :disabled="loadingCount > 0"
                  @update:model-value="(v: string[]) => (states.type = v)"
                />
              </tr>
              <tr>
                <OptionsGroup
                  :model-value="states.rarity"
                  :title="options.rarity.title"
                  :options="options.rarity.options"
                  :disabled="loadingCount > 0"
                  @update:model-value="(v: string[]) => (states.rarity = v)"
                />
              </tr>
              <tr>
                <FilterSub
                  v-bind="
                    states.sub ? { selected: states.sub } : { selected: [] }
                  "
                  :title="subOptions.title"
                  :options="subOptions.options"
                  :placeholder="subOptions.placeholder"
                  :disabled="loadingCount > 0"
                  @update:selected="(v: string[]) => (states.sub = v)"
                />
                />
              </tr>
            </tbody>
          </table>
        </NCollapseTransition>
      </NCard>
      <NCard
        :title="customLabel[locale].tableCollapse"
        header-style="text-align: center;"
        size="small"
      >
        <template #header-extra>
          <div
            class="m-1 cursor-pointer"
            @click="equipFilterShow = !equipFilterShow"
          >
            <span v-if="equipFilterShow" class="mdi mdi-chevron-up text-2xl" />
            <span v-else class="mdi mdi-chevron-down text-2xl" />
          </div>
        </template>
        <NCollapseTransition :show="equipFilterShow">
          <div class="flex flex-row items-center justify-center">
            <span class="basis-1/8">
              {{ customLabel[locale].tableFilterLabel }}
            </span>
            <div class="flex basis-7/8 flex-col items-center">
              <NButtonGroup size="small">
                <NButton
                  type="default"
                  class="my-1"
                  @click="
                    () => {
                      const filterArray = sortStates.filter;
                      if (filterArray) {
                        filterArray.push({
                          mode: 'all',
                          value: 'yes',
                        });
                      }
                    }
                  "
                >
                  <span class="mdi mdi-plus text-xl"></span>
                </NButton>
                <NButton
                  type="default"
                  class="my-1"
                  @click="
                    () => {
                      const filterArray = sortStates.filter;
                      if (filterArray && filterArray.length > 1) {
                        filterArray.pop();
                      }
                    }
                  "
                >
                  <span class="mdi mdi-minus text-xl"></span>
                </NButton>
              </NButtonGroup>
              <div
                v-for="(v, i) in sortStates.filter"
                :key="i"
                class="w-full flex flex-row items-center"
              >
                <NSelect
                  v-model:value="v.mode"
                  class="m-1"
                  :disabled="loadingCount > 0"
                  :options="sortOptions.filterOption"
                />
                <NSelect
                  v-if="v.mode === 'addtime'"
                  v-model:value="v.value"
                  class="m-1"
                  :disabled="loadingCount > 0"
                  :options="timeData"
                  clearable
                  multiple
                  :fallback-option="false"
                />
                <NInput
                  v-else-if="v.mode === 'mission2opt'"
                  v-model:value="v.value as string"
                  :disabled="loadingCount > 0"
                  clearable
                >
                </NInput>
                <NSelect
                  v-else
                  v-model:value="v.value"
                  class="m-1"
                  :disabled="loadingCount > 0 || v.mode === 'all'"
                  :options="getFilterValue(locale, v.mode)"
                  :fallback-option="false"
                />
              </div>
            </div>
          </div>
          <div class="flex flex-row items-center justify-center">
            <span class="basis-1/8">
              {{ customLabel[locale].tableSortLabel }}
            </span>
            <div class="flex basis-7/8 flex-row items-center">
              <NSelect
                v-if="sortStates.sort && sortStates.sort[0]"
                v-model:value="sortStates.sort[0].mode"
                class="m-1"
                :disabled="loadingCount > 0 || listShow === false"
                :options="sortOptions.sortOption"
              />
            </div>
          </div>
        </NCollapseTransition>
      </NCard>
      <NCard
        :content-style="mobileStyle() || undefined"
        title=" "
        header-style="text-align: center;"
        size="small"
      >
        <template #header-extra>
          <NButtonGroup v-if="!listShow" size="small" class="mx-1">
            <NButton
              secondary
              :disabled="loadingCount > 0"
              :type="group === 'sub' ? 'info' : 'default'"
              @click="group = 'sub'"
            >
              <span class="mdi mdi-shape text-xl" />
            </NButton>
            <NButton
              secondary
              :disabled="loadingCount > 0"
              :type="group === 'time' ? 'info' : 'default'"
              @click="group = 'time'"
            >
              <span class="mdi mdi-clock-time-eight text-xl" />
            </NButton>
            <NButton
              secondary
              :disabled="loadingCount > 0"
              :type="group === 'opt' ? 'info' : 'default'"
              @click="group = 'opt'"
            >
              <span class="mdi mdi-sword-cross text-xl" />
            </NButton>
          </NButtonGroup>
          <NButtonGroup v-else size="small" class="mx-1">
            <NButton
              secondary
              :disabled="loadingCount > 0"
              :type="simple === 'stats' ? 'info' : 'default'"
              @click="simple = 'stats'"
            >
              <span class="mdi mdi-numeric text-xl" />
            </NButton>
            <NButton
              secondary
              :disabled="loadingCount > 0"
              :type="simple === 'mission' ? 'info' : 'default'"
              @click="simple = 'mission'"
            >
              <span class="mdi mdi-clipboard-check text-xl" />
            </NButton>
          </NButtonGroup>
          <NButtonGroup size="small">
            <NButton
              secondary
              :disabled="loadingCount > 0"
              :type="listShow ? 'info' : 'default'"
              @click="listShow = true"
            >
              <span class="mdi mdi-view-list text-xl" />
            </NButton>
            <NButton
              secondary
              :disabled="loadingCount > 0"
              :type="listShow ? 'default' : 'info'"
              @click="listShow = false"
            >
              <span class="mdi mdi-view-grid text-xl" />
            </NButton>
          </NButtonGroup>
        </template>
        <div v-if="!listShow">
          <EquipGroup :data="filteredEquipData" :group="group"></EquipGroup>
        </div>
        <div v-else>
          <NScrollbar trigger="none" :x-scrollable="true">
            <EquipTable :data="CharEquipList"> </EquipTable>
          </NScrollbar>
        </div>
      </NCard>
    </NLayout>
  </NConfigProvider>
</template>
