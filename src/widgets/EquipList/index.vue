<script lang="ts">
import { defineComponent, computed, ref, onMounted, provide, watch } from "vue";

import { useUrlSearchParams } from "@vueuse/core";
import {
  NButton,
  NButtonGroup,
  NCard,
  NCollapse,
  NCollapseItem,
  NCollapseTransition,
  NConfigProvider,
  NSelect,
  NEmpty,
  NLayout,
  NScrollbar,
} from "naive-ui";

import OptionsGroup from "@/components/OptionsGroup.vue";
import { getLanguage, getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { isMobile } from "@/utils/utils";

import EquipTable from "./EquipTable.vue";
import FilterSub from "./FilterSub.vue";
import SubContainer from "./SubContainer.vue";
import { rarityMap, statsStyleMap } from "./consts";
import { getEquipDataAll } from "./equipData";
import {
  customLabel,
  getFilterType,
  getFilterRarity,
  getFilterOptions,
  getFilterValue,
  getSortOptions,
  getSortValue,
  getZhType,
  getLocaleType,
} from "./i18n";
import { CharEquips, EquipRow } from "./types";

interface FilterValue {
  mode: string;
  value: string;
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

export default defineComponent({
  components: {
    NButton,
    NButtonGroup,
    NCard,
    NCollapse,
    NCollapseItem,
    NCollapseTransition,
    NConfigProvider,
    NSelect,
    NEmpty,
    NLayout,
    NScrollbar,
    EquipTable,
    OptionsGroup,
    SubContainer,
    FilterSub,
  },
  setup() {
    const i18nConfig = getNaiveUILocale();
    const { theme, toggleDark } = useTheme();
    const locale = getLanguage();
    const hash = useUrlSearchParams("hash");
    const filterShow = ref(true);
    const listShow = ref(true);
    const showChars = ref<string[]>([]);
    provide("showChars", showChars);
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
      sortValue: getSortValue(locale),
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
      sortStates.value.sort[0].mode == "default"
        ? delete hash.sort
        : (hash.sort = sortStates.value.sort[0].mode);
      hash.filter = sortStates.value.filter
        .filter((v) => {
          return v.mode == "all" ? false : true;
        })
        .map((v) => {
          return v.mode + "_" + v.value.slice(0, 1);
        });
    };
    watch(states, updateHash, { deep: true });
    watch(sortStates, updateHash, { deep: true });

    const charEquipData = ref<Record<string, CharEquips[]>>({});
    const filterData = (data: DOMStringMap): boolean => {
      return sortStates.value.filter.every((v) => {
        if (v.mode == "all") return true;
        if (v.mode == "trait") {
          return v.value == "yes" ? !!data["add"] : !data["add"];
        }
        if (v.mode == "type") {
          const match = !!data["type"]?.match(new RegExp(`-${v.value}`, "i"));
          const nmatch = !!data["type"]?.match(/-[^xy]/i);
          return v.value == "x" || v.value == "y" ? match : nmatch;
        }
        if (v.mode == "talent") {
          const match =
            !!data["talent2"]?.match("新增天赋") ||
            !!data["talent3"]?.match("新增天赋");
          return v.value == "yes" ? match : !match;
        }
        return v.value == "yes" ? data[v.mode] != "0" : data[v.mode] == "0";
      });
    };
    const filteredCharEquipData = computed((): Record<string, CharEquips[]> => {
      const s = states.value;
      const result: Record<string, CharEquips[]> = {};
      for (const sub in charEquipData.value) {
        const ces = charEquipData.value[sub];
        const temp: CharEquips[] = [];
        if (s.sub.length > 0 && !s.sub.includes(sub)) continue;
        if (
          s.type.length > 0 &&
          !s.type.includes(getLocaleType(ces[0].char.type, locale))
        )
          continue;
        for (const ce of ces) {
          if (
            s.rarity.length > 0 &&
            !s.rarity.includes(rarityMap[ce.char.rarity.toString()])
          )
            continue;
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
                data: e,
              };
            }),
          );
        }
      }
      if (sortStates.value.sort[0].mode != "default") {
        result.sort((x, y) => {
          const mode = sortStates.value.sort[0].mode;
          const order = sortStates.value.sort[0].value == "asc" ? 1 : -1;
          const numx = x.data[mode + "3"] ? Number(x.data[mode + "3"]) : 0;
          const numy = y.data[mode + "3"] ? Number(y.data[mode + "3"]) : 0;
          return (numx - numy) * order * (statsStyleMap[mode] ?? 1);
        });
      }
      return result;
    });

    const initFromHash = () => {
      for (const [k, v] of Object.entries(hash)) {
        if (k == "sort" && v != "default") {
          sortStates.value.sort[0].mode = v as string;
        }
        if (k == "filter") {
          const res = typeof v == "string" ? [v] : v;
          sortStates.value.filter = res.map((e) => {
            const mode = e.slice(0, -2);
            const value = e.slice(-1);
            return mode == "type"
              ? {
                  mode: mode,
                  value: value,
                }
              : {
                  mode: mode,
                  value: value == "y" ? "yes" : "no",
                };
          });
        }
        if (k == "type") {
          states.value[k] = (v as string).split("").map((e) => {
            return customLabel[locale].typeOptions[Number(e)];
          });
        }
        if (k == "rarity") {
          states.value[k] = (v as string).split("").map((e) => {
            return rarityMap[e];
          });
        }
        if (k == "sub") {
          states.value[k] = (v as string).split("-");
        }
      }
    };
    onMounted(async () => {
      loadingCount.value = 1;
      const resp = await fetch(
        `/api.php?${new URLSearchParams({
          action: "ask",
          format: "json",
          query:
            "[[分类:拥有专属模组的干员]]|?干员外文名|?干员名jp|?子职业|?干员序号|?稀有度|?职业|sort=子职业|order=asc|limit=1000|link=none|link=none|sep=,|propsep=;|format=list",
          api_version: "2",
          utf8: "1",
        })}`,
      );
      const json = await resp.json();
      const equips = (await getEquipDataAll()) as Record<
        string,
        DOMStringMap[]
      >;

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
          equips: equips[k],
        };
      });
      for (const i of charData) {
        if (!subProfMap.value[i.char.type]) subProfMap.value[i.char.type] = [];

        if (!charEquipData.value[i.char.subtype])
          charEquipData.value[i.char.subtype] = [];

        if (!~subProfMap.value[i.char.type].indexOf(i.char.subtype))
          subProfMap.value[i.char.type].push(i.char.subtype);

        charEquipData.value[i.char.subtype].push(i);
      }
      for (const key of Object.keys(charEquipData.value)) {
        charEquipData.value[key].sort((a, b) => {
          return a.char.rarity === b.char.rarity
            ? b.char.id - a.char.id
            : Number.parseInt(b.char.rarity as string) -
                Number.parseInt(a.char.rarity as string);
        });
      }

      initFromHash();
      loadingCount.value = 0;
    });

    return {
      i18nConfig,
      isMobile,
      theme,
      toggleDark,
      locale,
      customLabel,
      filterShow,
      listShow,
      loadingCount,
      states,
      sortStates,
      options,
      subOptions,
      sortOptions,
      filteredCharEquipData,
      CharEquipList,
      getFilterValue,
      mobileStyle: () => {
        return isMobile() ? "padding: 5px" : undefined;
      },
    };
  },
});
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
              <tr>
                <div class="my-2">
                  <NCollapse :default-expanded-names="isMobile() ? '' : 'sort'">
                    <NCollapseItem
                      name="sort"
                      :title="customLabel[locale].tableCollapse"
                    >
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
                              v-model:value="v.value"
                              class="m-1"
                              :disabled="loadingCount > 0 || v.mode == 'all'"
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
                            :disabled="loadingCount > 0 || listShow == false"
                            :options="sortOptions.sortOption"
                          />
                        </div>
                      </div>
                    </NCollapseItem>
                  </NCollapse>
                </div>
              </tr>
            </tbody>
          </table>
        </NCollapseTransition>
      </NCard>
      <NCard
        title=" "
        header-style="text-align: center;"
        :content-style="mobileStyle()"
        size="small"
      >
        <template #header-extra>
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
