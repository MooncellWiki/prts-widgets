<script lang="ts">
import { computed, defineComponent, onMounted, reactive, ref } from "vue";

import { debounce } from "lodash-es";
import {
  NButton,
  NConfigProvider,
  NEmpty,
  NInput,
  NLayout,
  NPagination,
} from "naive-ui";

import OptionsGroup from "@/components/OptionsGroup.vue";
import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";

import Memory from "./Memory.vue";
import { rarityMap, filterRarity } from "./consts";
import { CharMemory, Medal } from "./types";
import { getOnlineDate, getTargetDate, getMemories } from "./util";

export default defineComponent({
  components: {
    NButton,
    NConfigProvider,
    NEmpty,
    NLayout,
    NInput,
    NPagination,
    OptionsGroup,
    Memory,
  },
  setup() {
    const isMobile = document.body.classList.contains("skin-minerva");
    const i18nConfig = getNaiveUILocale();
    const { theme, toggleDark } = useTheme();
    const states = ref<string[]>([]);
    const isLoaded = ref(false);
    const sorting = ref("lmmr");
    const order = ref(-1);
    const searchTerm = ref("");
    const charMemoryData = ref<CharMemory[]>([]);
    const medalData = ref<Medal[]>([]);
    const latestChar = ref<string[]>([]);

    const compareDate = (mmrx: CharMemory, mmry: CharMemory) => {
      let result = 0;
      let datex: Date;
      let datey: Date;
      if (
        onlineDate.value &&
        onlineDate.value[mmrx.char] &&
        onlineDate.value[mmry.char] &&
        sorting.value !== "opt"
      ) {
        const isLatest = sorting.value === "lmmr";
        datex = getTargetDate(onlineDate.value[mmrx.char], isLatest);
        datey = getTargetDate(onlineDate.value[mmry.char], isLatest);
      } else {
        datex = new Date(1);
        datey = new Date(1);
      }
      result =
        datex.getTime() === datey.getTime()
          ? Number(mmrx.charID) - Number(mmry.charID)
          : datex.getTime() - datey.getTime();
      return order.value ? result * order.value : result * -1;
    };
    const filteredMemory = ref<CharMemory[]>([]);

    function _calcMemory() {
      if (states.value.length === 0 && searchTerm.value === "") {
        filteredMemory.value = charMemoryData.value.toSorted(compareDate);
      }

      const rarity = states.value;
      const keyword = searchTerm.value;
      filteredMemory.value = charMemoryData.value
        .filter((charm) => {
          if (rarity.length > 0 && !rarity.includes(rarityMap[charm.rarity]))
            return false;

          return (
            charm.char.includes(keyword) ||
            charm.memories.some(
              (memory) =>
                memory.name.includes(keyword) ||
                memory.info.some((info) => info.intro.includes(keyword)),
            )
          );
        })
        .sort(compareDate);
    }
    const calcMemory = debounce(_calcMemory, 500);
    const onlineDate = ref<Record<string, Date[]>>({});

    const pagination = reactive({
      page: 1,
      pageSize: 10,
      pageSizes: [10, 25, 50, 100],
      pageSlot: isMobile ? 5 : 9,
    });
    function onUpdatePageSize(pageSize: number) {
      pagination.pageSize = pageSize;
      pagination.page = 1;
      calcMemory();
    }
    const shownMemory = computed(() => {
      return filteredMemory.value.slice(
        pagination.pageSize * (pagination.page - 1),
        pagination.pageSize * pagination.page,
      );
    });

    onMounted(async () => {
      const resp = await fetch(
        `/api.php?${new URLSearchParams({
          action: "ask",
          format: "json",
          query:
            "[[分类:拥有干员密录的干员]]|?干员序号|?情报编号|?稀有度|sort=干员序号|order=asc|limit=1000|link=none|link=none|sep=,|propsep=;|format=list",
          api_version: "2",
          utf8: "1",
        })}`,
      );
      const json = await resp.json();
      charMemoryData.value = Object.entries(json.query.results).map(
        ([key, value]: [string, any]) => {
          return {
            char: key,
            charID: value.printouts["干员序号"][0] as string,
            charEID: value.printouts["情报编号"][0] as string,
            rarity: value.printouts["稀有度"][0] as string,
            memories: [],
          };
        },
      );

      const respMedal = await fetch(
        `/index.php?${new URLSearchParams({
          action: "raw",
          title: "光荣之路/data",
        })}`,
      );
      const jsonMedal = await respMedal.json();
      medalData.value = Object.entries(jsonMedal.medal)
        .filter(
          ([key]: [string, any]) =>
            jsonMedal.category.storyMedal.medal.includes(key) ||
            jsonMedal.category.hiddenMedal.medal.includes(key),
        )
        .map(([, value]: [string, any]) => {
          return {
            medal: value.name as string,
            alias: value.alias as string,
            desc: value.desc as string,
          };
        });
      const map = await getMemories(medalData.value);
      for (const charm of charMemoryData.value) {
        charm.memories = map[charm.char];
      }

      onlineDate.value = await getOnlineDate();
      isLoaded.value = true;

      _calcMemory();
      const latest = onlineDate.value[filteredMemory.value[0].char];
      const ldate = getTargetDate(latest, true);
      for (let char in onlineDate.value) {
        if (getTargetDate(onlineDate.value[char], true) >= ldate)
          latestChar.value.push(char);
      }
    });

    return {
      theme,
      sortModes: [
        { type: "opt", label: "干员上线" },
        { type: "fmmr", label: "首个密录" },
        { type: "lmmr", label: "最新密录" },
      ],
      orderModes: [
        { value: 1, icon: "mdi-sort-calendar-descending" },
        { value: -1, icon: "mdi-sort-calendar-ascending" },
      ],
      toggleDark,
      i18nConfig,
      filterRarity,
      states,
      searchTerm,
      calcMemory,
      pagination,
      onUpdatePageSize,
      filteredMemory,
      shownMemory,
      onlineDate,
      sorting,
      order,
      isLoaded,
      latestChar,
      sortMode: (mode: string) => {
        calcMemory();
        sorting.value = mode;
      },
      orderMode: (mode: number) => {
        calcMemory();
        order.value = mode;
      },
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
    <NLayout class="md:p-4 p-2 antialiased mx-auto lg:max-w-[90rem] max-w-3xl">
      <table class="w-full text-left border-collapse important-table">
        <tbody class="align-baseline">
          <tr>
            <OptionsGroup
              v-model="states"
              :title="filterRarity.title"
              :options="filterRarity.options"
              @update:model-value="calcMemory"
            />
          </tr>
          <tr>
            <div class="flex flex-row justify-center items-center">
              <span class="basis-1/8">排序</span>
              <div class="flex flex-row items-center basis-7/8 justify-between">
                <div class="flex flex-wrap justify-start">
                  <NButton
                    v-for="(item, index) in sortModes"
                    :key="index"
                    class="m-1"
                    :disabled="!isLoaded"
                    :type="sorting === item.type ? 'info' : 'default'"
                    @click="sortMode(item.type)"
                    >{{ item.label }}</NButton
                  >
                </div>
                <div class="flex flex-wrap justify-end">
                  <NButton
                    v-for="(item, index) in orderModes"
                    :key="index"
                    class="m-1"
                    :disabled="!isLoaded"
                    :type="order === item.value ? 'info' : 'default'"
                    @click="orderMode(item.value)"
                    ><span :class="['text-2xl mdi', item.icon]"></span>
                  </NButton>
                </div>
              </div>
            </div>
          </tr>
          <tr>
            <div class="flex items-center">
              <NInput
                v-model:value="searchTerm"
                class="my-2"
                type="text"
                placeholder="搜索干员名称/密录名称/引言文字"
                @update:value="calcMemory"
              />
              <div class="px-2" @click="toggleDark()">
                <NButton>
                  <span v-if="theme" class="text-2xl mdi mdi-brightness-6" />
                  <span v-else class="text-2xl mdi mdi-brightness-4" />
                </NButton>
              </div>
            </div>
          </tr>
        </tbody>
        <NPagination
          v-model:page="pagination.page"
          class="justify-center my-2"
          :item-count="filteredMemory.length"
          :page-size="pagination.pageSize"
          :page-sizes="pagination.pageSizes"
          :page-slot="pagination.pageSlot"
          show-size-picker
          @update:page="calcMemory"
          @update:page-size="onUpdatePageSize"
        />
        <div class="w-full flex flex-col lg:flex-row flex-wrap">
          <Memory
            v-for="charm in shownMemory"
            :key="charm.char"
            :char-memory="charm"
            :is-new="latestChar.includes(charm.char)"
          >
          </Memory>
        </div>
        <NEmpty v-if="shownMemory.length === 0" description="无结果">
          <template #icon>
            <span class="text-5xl mdi mdi-book-search" />
          </template>
        </NEmpty>
        <NPagination
          v-model:page="pagination.page"
          class="justify-center my-2"
          :item-count="filteredMemory.length"
          :page-size="pagination.pageSize"
          :page-sizes="pagination.pageSizes"
          :page-slot="pagination.pageSlot"
          show-size-picker
          @update:page="calcMemory"
          @update:page-size="onUpdatePageSize"
        />
      </table>
    </NLayout>
  </NConfigProvider>
</template>
