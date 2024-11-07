<script setup lang="ts">
import { computed, onBeforeMount, onMounted, provide, ref, watch } from "vue";

import { useUrlSearchParams } from "@vueuse/core";
import {
  NButton,
  NButtonGroup,
  NCard,
  NCollapseTransition,
  NConfigProvider,
  NEmpty,
  NInput,
  NLayout,
  NScrollbar,
  NSelect,
} from "naive-ui";

import OptionsGroup from "@/components/OptionsGroup.vue";
import { getLanguage, getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { isMobile } from "@/utils/utils";

import EquipTable from "./components/EquipTable.vue";
import FilterSub from "./components/FilterSub.vue";
import SubContainer from "./components/SubContainer.vue";
import { rarityMap, statsStyleMap } from "./consts";
import { askOperators, getEquipAddedTime, getEquipDataAll } from "./equipData";
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
import { CharEquips, EquipRow } from "./types";

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
    mode: "default",
    value: "desc",
  };
}

const i18nConfig = getNaiveUILocale();
const { theme, toggleDark } = useTheme();
const locale = getLanguage();
const hash = useUrlSearchParams("hash");
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
  if (states.value.type.length === 0) return subProfMap.value;
  for (const t of states.value.type) {
    map[getZhType(t, locale)] = subProfMap.value[getZhType(t, locale)];
  }
  return map;
});

const subOptions = computed(() => {
  return {
    title: customLabel[locale].subtypeLabel,
    placeholder: customLabel[locale].subPlaceholder,
    options: Object.entries(filteredSubProfMap.value).map(([k, v]) => {
      return {
        type: "group",
        label: customLabel[locale].subtypeMap[k] ?? k,
        key: k,
        children: v.map((subProf) => {
          return {
            label: customLabel[locale].subtypeMap[subProf] ?? subProf,
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
const updateHash = () => {
  if (states.value.type.length > 0) {
    hash.type = states.value.type
      .map((v) => {
        return customLabel[locale].typeOptions.indexOf(v as string);
      })
      .join("");
  } else delete hash.type;
  if (states.value.rarity.length > 0) {
    hash.rarity = states.value.rarity
      .map((v) => {
        return Number(v.slice(1)) - 1;
      })
      .join("");
  } else delete hash.rarity;
  if (states.value.sub.length > 0) {
    hash.sub = states.value.sub.join("-");
  } else delete hash.sub;
  if (sortStates.value.sort[0].mode === "default") {
    delete hash.sort;
  } else {
    hash.sort = sortStates.value.sort[0].mode;
  }
  hash.list = listShow.value.toString();
  if (listShow.value) delete hash.group;
  else hash.group = group.value;
  hash.filter = sortStates.value.filter
    .filter((v) => {
      return v.mode === "all" ? false : true;
    })
    .map((v) => {
      let value = "";
      if (v.mode === "addtime") {
        v.value = typeof v.value === "string" ? [v.value] : v.value;
        value = (v.value as string[]).join("-");
      } else if (v.mode === "mission2opt") {
        value = v.value as string;
      } else {
        value = (v.value as string).slice(0, 1);
      }
      return `${v.mode}_${value}`;
    });
};
watch(states, updateHash, { deep: true });
watch(sortStates, updateHash, { deep: true });
watch(listShow, updateHash, { deep: true });
watch(group, updateHash, { deep: true });

const rawEquipData = ref<CharEquips[]>([]);
const charEquipData = computed<Record<string, CharEquips[]>>(() => {
  const result: Record<string, CharEquips[]> = {};
  const term = group.value;
  if (term === "time") {
    for (const charEquip of rawEquipData.value) {
      for (const equip of charEquip.equips) {
        const { addtime } = equip;
        if (!addtime) continue;

        if (!result[addtime]) {
          result[addtime] = [];
        }
        result[addtime].push({
          char: charEquip.char,
          equips: [equip],
        });
      }
    }
  } else if (term === "opt") {
    for (const charEquip of rawEquipData.value) {
      for (const equip of charEquip.equips) {
        const { mission2opt = "unknown" } = equip;

        if (!result[mission2opt]) {
          result[mission2opt] = [];
        }
        result[mission2opt].push({
          char: charEquip.char,
          equips: [equip],
        });
      }
    }
  } else {
    for (const charEquip of rawEquipData.value) {
      if (!result[charEquip.char.subtype]) {
        result[charEquip.char.subtype] = [];
      }
      result[charEquip.char.subtype].push(charEquip);
    }
  }
  for (const key of Object.keys(result)) {
    result[key].sort((a, b) => {
      return a.char.rarity === b.char.rarity
        ? b.char.id - a.char.id
        : Number.parseInt(b.char.rarity as string) -
            Number.parseInt(a.char.rarity as string);
    });
  }
  return result;
});
const filterData = (data: DOMStringMap): boolean => {
  return sortStates.value.filter.every((v) => {
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
        const nmatch = !type?.match(/-[xyδ]/i);

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
const filteredCharEquipData = computed((): Record<string, CharEquips[]> => {
  const s = states.value;
  const result: Record<string, CharEquips[]> = {};
  for (const sub in charEquipData.value) {
    const ces = charEquipData.value[sub];
    const temp: CharEquips[] = [];
    for (const ce of ces) {
      const rarityP =
        s.rarity.length > 0 &&
        !s.rarity.includes(rarityMap[ce.char.rarity.toString()]);
      const subP = s.sub.length > 0 && !s.sub.includes(ce.char.subtype);
      const typeP =
        s.type.length > 0 &&
        !s.type.includes(getLocaleType(ce.char.type, locale));
      if (rarityP || subP || typeP) continue;
      const data = ce.equips.filter((e) => filterData(e));
      if (data.length > 0)
        temp.push({
          char: ce.char,
          equips: data,
        });
    }
    if (temp.length > 0) {
      result[sub] = temp;
    }
  }
  return result;
});
const CharEquipList = computed(() => {
  const result: EquipRow[] = [];
  for (const sub in filteredCharEquipData.value) {
    for (const char of filteredCharEquipData.value[sub]) {
      result.push(
        ...char.equips.map((e) => {
          return {
            name: e.name ?? "",
            type: e.type ?? "",
            operator: char.char.name,
            oprarity: char.char.rarity,
            opid: char.char.id,
            data: e,
          };
        }),
      );
    }
  }
  result.sort((x, y) => {
    switch (sortStates.value.sort[0].mode) {
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
        const mode = sortStates.value.sort[0].mode;
        const order = sortStates.value.sort[0].value === "asc" ? 1 : -1;
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

const initFromHash = () => {
  for (const [k, v] of Object.entries(hash)) {
    if (k === "sort" && v !== "default") {
      sortStates.value.sort[0].mode = v as string;
    }
    if (k === "filter") {
      const res = typeof v === "string" ? [v] : v;
      sortStates.value.filter = res.map((e) => {
        const matches = e.match(/^(.*?)_(.*?)$/) as string[];
        const mode = matches[1];
        const value = matches[2];
        if (mode === "addtime") {
          return {
            mode,
            value: value.split("-"),
          };
        }
        return mode === "type" || mode === "mission2opt"
          ? {
              mode,
              value,
            }
          : {
              mode,
              value: value === "y" ? "yes" : "no",
            };
      });
    }
    if (k === "type") {
      states.value[k] = (v as string).split("").map((e) => {
        return customLabel[locale].typeOptions[Number(e)];
      });
    }
    if (k === "rarity") {
      states.value[k] = (v as string).split("").map((e) => {
        return rarityMap[e];
      });
    }
    if (k === "sub") {
      states.value[k] = (v as string).split("-");
    }
    if (k === "list") {
      listShow.value = v === "true" ? true : false;
    }
    if (k === "group") {
      group.value = v as string;
    }
  }
};
onBeforeMount(async () => {
  loadingCount.value = 1;
  const [json, equips, time] = await Promise.all([
    askOperators(),
    getEquipDataAll(),
    getEquipAddedTime(),
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
    if (!subProfMap.value[i.char.type]) subProfMap.value[i.char.type] = [];
    if (!~subProfMap.value[i.char.type].indexOf(i.char.subtype))
      subProfMap.value[i.char.type].push(i.char.subtype);
  }
  rawEquipData.value = charData;
  timeData.value = time.map((i) => {
    return {
      label: new Date(i.time * 1000).toLocaleDateString(locale),
      value: i.time.toString(),
    };
  });
  loadingCount.value = 0;
});
onMounted(() => {
  initFromHash();
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
                  v-model="states.type"
                  :title="options.type.title"
                  :options="options.type.options"
                  :disabled="loadingCount > 0"
                />
              </tr>
              <tr>
                <OptionsGroup
                  v-model="states.rarity"
                  :title="options.rarity.title"
                  :options="options.rarity.options"
                  :disabled="loadingCount > 0"
                />
              </tr>
              <tr>
                <FilterSub
                  v-model:selected="states.sub"
                  :title="subOptions.title"
                  :options="subOptions.options"
                  :placeholder="subOptions.placeholder"
                  :disabled="loadingCount > 0"
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
            <span v-if="filterShow" class="mdi mdi-chevron-up text-2xl" />
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
                      sortStates.filter.push({
                        mode: 'all',
                        value: 'yes',
                      });
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
                      if (sortStates.filter.length > 1) {
                        sortStates.filter.pop();
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
                  multiple
                  clearable
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
        title=" "
        header-style="text-align: center;"
        :content-style="mobileStyle()"
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
          <div class="w-full flex flex-col flex-wrap">
            <SubContainer
              v-for="(chars, subtype) in filteredCharEquipData"
              :key="subtype"
              :chars="chars"
              :title="subtype"
              :groupby="group"
            />
          </div>
          <NEmpty
            v-if="Object.keys(filteredCharEquipData).length === 0"
            :description="customLabel[locale].emptyDesc"
          >
            <template #icon>
              <span class="mdi mdi-account-filter-outline text-5xl" />
            </template>
          </NEmpty>
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
