<script lang="ts">
import {
  NCard,
  NCollapseTransition,
  NConfigProvider,
  NEmpty,
  NLayout,
  NScrollbar,
  NPagination,
} from "naive-ui";
import {
  computed,
  defineComponent,
  nextTick,
  onMounted,
  provide,
  ref,
  watch,
} from "vue";

import OptionsGroup from "@/components/OptionsGroup.vue";
import { getLanguage, getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { isMobileSkin } from "@/utils/utils";

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
} from "./i18n";
import { Char } from "./types";
import { updateTippy } from "./utils";

export function onClickTag(charname: string): void {
  const items = document.querySelectorAll(".equipitem");
  const affix = document.querySelectorAll(".affix")[0];
  const ele = Array.from(items).find((item) => {
    return (item as HTMLElement).dataset?.opt === charname;
  });
  const affixStatus = affix.classList.contains("n-affix--affixed") ? 1 : 2;
  const affixHeight = affix.getBoundingClientRect().height;

  const y = ele?.getBoundingClientRect().y ?? Number.NaN;
  window.scrollBy({
    behavior: "smooth",
    top: y - (affixStatus * affixHeight + 10),
    left: 0,
  });
}

export default defineComponent({
  components: {
    OptionsGroup,
    FilterSub,
    NCard,
    NConfigProvider,
    NLayout,
    NCollapseTransition,
    NEmpty,
    NScrollbar,
    SubContainer,
    EquipTable,
    NPagination,
  },
  setup() {
    const filterShow = ref(true);
    const operatorShow = ref(true);
    const resultShow = ref(true);
    const isMobile = isMobileSkin();
    const i18nConfig = getNaiveUILocale();
    const { theme, toggleDark } = useTheme();
    const locale = getLanguage();

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
    const getFilteredCharCount = () => {
      let count = 0;
      for (const sub in filteredCharData.value) {
        count += filteredCharData.value[sub].length;
      }
      return count;
    };
    const charDataTable = computed<Char[]>(() => {
      let list: Char[] = [];
      let skip = pagination.value.pageSize * (pagination.value.page - 1);
      const size = pagination.value.pageSize;
      for (const subtype in filteredCharData.value) {
        list = list.concat(filteredCharData.value[subtype]);
        if (skip > 0 && list.length <= skip) {
          continue;
        }
        if (skip > 0 && list.length > skip) {
          list.splice(0, skip);
          skip = 0;
        }
        if (list.length > size) {
          list = list.slice(0, size);
          break;
        }
      }
      return list;
    });
    watch(states.value, () => {
      pagination.value.page = 1;
    });

    const showChars = ref<string[]>([]);
    provide("showChars", showChars);
    const loadingCount = ref(0);
    provide("loadingCount", loadingCount);

    const pagination = ref({
      page: 1,
      pageSize: 5,
      pageSizes: customLabel[locale].pagination,
      pageSlot: isMobile ? 5 : 9,
      pickSize: () => {
        return isMobile ? "small" : "medium";
      },
    });

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
      onClickTag,
      charDataTable,
      pagination,
      getFilteredCharCount,
      i18nConfig,
      locale,
      loadingCount,
      customLabel,
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
          <div class="m-1 cursor-pointer" @click="operatorShow = false">
            <span class="text-2xl mdi mdi-view-list" />
          </div>
          <div class="m-1 cursor-pointer" @click="operatorShow = true">
            <span class="text-2xl mdi mdi-view-grid" />
          </div>
        </template>
        <div v-if="operatorShow">
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
        <div v-if="!operatorShow">
          <NPagination
            v-model:page="pagination.page"
            class="justify-center my-2"
            :item-count="getFilteredCharCount()"
            :page-size="pagination.pageSize"
            :page-sizes="pagination.pageSizes"
            :page-slot="pagination.pageSlot"
            :size="pagination.pickSize()"
            show-size-picker
            @update:page="
              (page) => {
                pagination.page = page;
              }
            "
            @update:page-size="
              (size) => {
                pagination.pageSize = size;
                pagination.page = 1;
              }
            "
          />
          <NScrollbar trigger="none" :x-scrollable="true">
            <EquipTable :chars="charDataTable"></EquipTable>
          </NScrollbar>
          <NPagination
            v-model:page="pagination.page"
            class="justify-center my-2"
            :item-count="getFilteredCharCount()"
            :page-size="pagination.pageSize"
            :page-sizes="pagination.pageSizes"
            :page-slot="pagination.pageSlot"
            :size="pagination.pickSize()"
            show-size-picker
            @update:page="
              (page) => {
                pagination.page = page;
              }
            "
            @update:page-size="
              (size) => {
                pagination.pageSize = size;
                pagination.page = 1;
              }
            "
          />
        </div>
      </NCard>
    </NLayout>
  </NConfigProvider>
</template>
