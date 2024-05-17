<script lang="ts">
import {
  computed,
  defineComponent,
  nextTick,
  onMounted,
  provide,
  ref,
  watch,
} from "vue";

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

import EquipTable from "./EquipTable.vue";
import FilterSub from "./FilterSub.vue";
import SubContainer from "./SubContainer.vue";
import { rarityMap } from "./consts";
import { getEquipDataAll } from "./equipData";
import {
  getFilterType,
  getFilterRarity,
  getLocaleType,
  getZhType,
  customLabel,
  getFilterOptions,
  getFilterValue,
  getSortOptions,
  getSortValue,
} from "./i18n";
import { Char } from "./types";
import { updateTippy } from "./utils";

export default defineComponent({
  components: {
    OptionsGroup,
    FilterSub,
    NButton,
    NButtonGroup,
    NCard,
    NConfigProvider,
    NLayout,
    NCollapse,
    NCollapseItem,
    NCollapseTransition,
    NSelect,
    NEmpty,
    NScrollbar,
    SubContainer,
    EquipTable,
  },
  setup() {
    const filterShow = ref(true);
    const operatorShow = ref(true);
    const resultShow = ref(true);
    const i18nConfig = getNaiveUILocale();
    const { theme, toggleDark } = useTheme();
    const locale = getLanguage();
    const hash = useUrlSearchParams("hash");

    const filterType = getFilterType(locale);
    const filterRarity = getFilterRarity(locale);
    const subProfMap = ref<Record<string, string[]>>({});
    const filteredSubProfMap = computed(() => {
      const map: Record<string, string[]> = {};
      if (states.value.type.length === 0) return subProfMap.value;
      for (const t of states.value.type) {
        map[getZhType(t, locale)] = subProfMap.value[getZhType(t, locale)];
      }
      return map;
    });
    const filterSub = computed(() => {
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
    const sortOptions = {
      sortOption: getSortOptions(locale),
      sortValue: getSortValue(locale),
      filterOption: getFilterOptions(locale),
      filterValue: getFilterValue(locale),
    };
    const sortValue = ref<Record<string, string>>({
      mode: "default",
      value: "desc",
    });
    const filterValue = ref<Record<string, string>[]>([
      {
        mode: "all",
        value: "yes",
      },
    ]);
    const sortedCharData = ref<Record<string, Char[]>>({});
    const states = ref<Record<string, string[]>>({
      type: [],
      rarity: [],
      sub: [],
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
      sortValue.value.mode == "default"
        ? delete hash.sort
        : (hash.sort = sortValue.value.mode);
      hash.filter = filterValue.value
        .filter((v) => {
          return v.mode == "all" ? false : true;
        })
        .map((v) => {
          return v.mode + "_" + v.value.slice(0, 1);
        });
    };
    watch(states, updateHash, { deep: true });
    watch(operatorShow, updateHash);
    watch(sortValue, updateHash, { deep: true });
    watch(filterValue, updateHash, { deep: true });
    const filterIntersection = (states: Record<string, string[]>) => {
      return Object.fromEntries(
        Object.entries(sortedCharData.value)
          .filter(([k, v]) => {
            if (states.sub.length > 0 && !states.sub.includes(k)) return false;
            if (
              states.type.length > 0 &&
              !states.type.includes(getLocaleType(v[0].type, locale))
            )
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
          .filter(([, v]) => v.length > 0),
      );
    };
    const filteredCharData = computed<Record<string, Char[]>>(() => {
      return filterIntersection(states.value);
    });
    const charDataTable = computed<Char[]>(() => {
      let list: Char[] = [];
      for (const subtype in filteredCharData.value) {
        list = list.concat(filteredCharData.value[subtype]);
      }
      return list;
    });

    const showChars = ref<string[]>([]);
    provide("showChars", showChars);
    const loadingCount = ref(0);
    provide("loadingCount", loadingCount);

    onMounted(async () => {
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

      const charData = Object.entries<Record<string, any>>(
        json.query.results,
      ).map<Char>(([k, v]) => {
        return {
          name: k,
          nameEN: v.printouts["干员外文名"][0] as string,
          nameJP: v.printouts["干员名jp"][0] as string,
          type: v.printouts["职业"][0] as string,
          subtype: v.printouts["子职业"][0] as string,
          rarity: v.printouts["稀有度"][0] as string,
          id: v.printouts["干员序号"][0] as number,
        };
      });
      for (const char of charData) {
        if (!subProfMap.value[char.type]) subProfMap.value[char.type] = [];

        if (!sortedCharData.value[char.subtype])
          sortedCharData.value[char.subtype] = [];

        if (!~subProfMap.value[char.type].indexOf(char.subtype))
          subProfMap.value[char.type].push(char.subtype);

        sortedCharData.value[char.subtype].push(char);
      }

      for (const key of Object.keys(sortedCharData.value)) {
        sortedCharData.value[key].sort((a: Char, b: Char) => {
          return a.rarity === b.rarity
            ? b.id - a.id
            : Number.parseInt(b.rarity as string) -
                Number.parseInt(a.rarity as string);
        });
      }
      for (const [k, v] of Object.entries(hash)) {
        if (k == "sort" && v != "default") {
          sortValue.value.mode = v as string;
        }
        if (k == "filter") {
          const res = typeof v == "string" ? [v] : v;
          filterValue.value = res.map((e) => {
            return {
              mode: e.slice(0, -2),
              value: e.slice(-1) == "y" ? "yes" : "no",
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
      await getEquipDataAll();

      nextTick(() => {
        updateTippy();
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
      theme,
      toggleDark,
      resultShow,
      charDataTable,
      i18nConfig,
      locale,
      loadingCount,
      customLabel,
      sortOptions,
      sortValue,
      filterValue,
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
    <NLayout class="md:p-4 antialiased mx-auto lg:max-w-[90rem] max-w-3xl">
      <NCard
        :title="customLabel[locale].filterTitle"
        header-style="text-align: center;"
        size="small"
      >
        <template #header-extra>
          <div class="m-1 cursor-pointer" @click="toggleDark()">
            <span v-if="theme" class="text-2xl mdi mdi-brightness-6" />
            <span v-else class="text-2xl mdi mdi-brightness-4" />
          </div>
          <div class="m-1 cursor-pointer" @click="filterShow = !filterShow">
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
                  :disabled="loadingCount > 0"
                />
              </tr>
              <tr>
                <OptionsGroup
                  v-model="states.rarity"
                  :title="filterRarity.title"
                  :options="filterRarity.options"
                  :disabled="loadingCount > 0"
                />
              </tr>
              <tr>
                <FilterSub
                  v-model:selected="states.sub"
                  :title="filterSub.title"
                  :options="filterSub.options"
                  :placeholder="filterSub.placeholder"
                  :disabled="loadingCount > 0"
                />
              </tr>
            </tbody>
          </table>
        </NCollapseTransition>
      </NCard>
      <NCard
        title=" "
        header-style="text-align: center;"
        size="small"
        class="selectcard"
      >
        <template #header-extra>
          <NButtonGroup size="small">
            <NButton
              secondary
              :disabled="loadingCount > 0"
              :type="operatorShow ? 'info' : 'default'"
              @click="operatorShow = true"
            >
              <span class="text-xl mdi mdi-view-list" />
            </NButton>
            <NButton
              secondary
              :disabled="loadingCount > 0"
              :type="operatorShow ? 'default' : 'info'"
              @click="operatorShow = false"
            >
              <span class="text-xl mdi mdi-view-grid" />
            </NButton>
          </NButtonGroup>
        </template>
        <div v-if="!operatorShow">
          <div class="w-full flex flex-col flex-wrap">
            <SubContainer
              v-for="(chars, subtype) in filteredCharData"
              :key="subtype"
              :chars="chars"
              :title="subtype"
            />
          </div>
          <NEmpty
            v-if="Object.keys(filteredCharData).length === 0"
            :description="customLabel[locale].emptyDesc"
          >
            <template #icon>
              <span class="text-5xl mdi mdi-account-filter-outline" />
            </template>
          </NEmpty>
        </div>
        <div v-else>
          <div class="my-1">
            <NCollapse default-expanded-names="sort">
              <NCollapseItem
                name="sort"
                :title="customLabel[locale].tableCollapse"
              >
                <div class="flex flex-row justify-center items-center">
                  <span class="basis-1/8">
                    {{ customLabel[locale].tableSortLabel }}
                  </span>
                  <div class="flex flex-row items-center basis-7/8">
                    <NSelect
                      v-model:value="sortValue.mode"
                      class="m-1"
                      :disabled="loadingCount > 0"
                      :options="sortOptions.sortOption"
                    />
                  </div>
                </div>
                <div class="flex flex-row justify-center items-center">
                  <span class="basis-1/8">
                    {{ customLabel[locale].tableFilterLabel }}
                  </span>
                  <div class="flex flex-col items-center basis-7/8">
                    <div
                      v-for="(v, i) in filterValue"
                      :key="i"
                      class="flex flex-row items-center w-full"
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
                        :options="sortOptions.filterValue"
                      />
                    </div>
                  </div>
                  <NButtonGroup vertical size="small">
                    <NButton
                      type="default"
                      class="my-1"
                      @click="
                        () => {
                          filterValue.push({
                            mode: 'all',
                            value: 'yes',
                          });
                        }
                      "
                    >
                      <span class="text-xl mdi mdi-plus"></span>
                    </NButton>
                    <NButton
                      type="default"
                      class="my-1"
                      @click="
                        () => {
                          if (filterValue.length > 1) {
                            filterValue.pop();
                          }
                        }
                      "
                    >
                      <span class="text-xl mdi mdi-minus"></span>
                    </NButton>
                  </NButtonGroup>
                </div>
              </NCollapseItem>
            </NCollapse>
          </div>
          <NScrollbar trigger="none" :x-scrollable="true">
            <EquipTable
              :chars="charDataTable"
              :sort-value="sortValue"
              :filter-value="filterValue"
            >
            </EquipTable>
          </NScrollbar>
        </div>
      </NCard>
    </NLayout>
  </NConfigProvider>
</template>
