<script lang="ts">
import { computed, defineComponent, onMounted, reactive, ref } from "vue";

import {
  NButton,
  NConfigProvider,
  NInput,
  NLayout,
  NPagination,
} from "naive-ui";
import { storeToRefs } from "pinia";

import OptionsGroup from "@/components/OptionsGroup.vue";
import { useThemeStore } from "@/stores/theme";
import { getNaiveUILocale } from "@/utils/i18n";

import Memory from "./Memory.vue";
import { CharMemory } from "./types";

export default defineComponent({
  components: {
    NButton,
    NConfigProvider,
    NLayout,
    NInput,
    NPagination,
    OptionsGroup,
    Memory,
  },
  setup() {
    const isMobile = document.body.classList.contains("skin-minerva");
    const i18nConfig = getNaiveUILocale();
    const themeStore = useThemeStore();
    const { theme } = storeToRefs(themeStore);
    const states = ref<Record<string, string[]>>({
      rarity: [],
    });
    const filterRarity = {
      title: "稀有度",
      options: ["1★", "2★", "3★", "4★", "5★", "6★"],
    };
    const rarityMap: Record<string, string> = {
      "0": "1★",
      "1": "2★",
      "2": "3★",
      "3": "4★",
      "4": "5★",
      "5": "6★",
    };
    const searchTerm = ref("");
    const charMemoryData = ref<CharMemory[]>([]);
    const filteredMemory = computed<CharMemory[]>(() => {
      if (states.value.rarity.length === 0 && searchTerm.value === "")
        return charMemoryData.value;
      const r = states.value.rarity;
      const s = searchTerm.value;
      const filtered = charMemoryData.value.filter((charm) => {
        if (r.length == 0 || r.includes(rarityMap[charm.rarity])) {
          if (
            charm.char.includes(s) ||
            charm.memories.some((memory) => {
              if (memory.name.includes(s)) return true;
              else {
                return memory.info.some((info) => {
                  return info.intro.includes(s) ? true : false;
                });
              }
            })
          )
            return true;
          else return false;
        } else {
          return false;
        }
      });
      return filtered;
    });
    const pagination = reactive({
      page: 1,
      pageSize: 10,
      pageSizes: [10, 25, 50, 100],
      pageSlot: isMobile ? 5 : 9,
      showSizePicker: true,
      onChange: (page: number) => {
        pagination.page = page;
      },
      onUpdatePageSize: (pageSize: number) => {
        pagination.pageSize = pageSize;
        pagination.page = 1;
      },
    });
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
            "[[分类:拥有干员密录的干员]]|?情报编号|?稀有度|sort=干员序号|order=asc|limit=1000|link=none|link=none|sep=,|propsep=;|format=list",
          api_version: "2",
          utf8: "1",
        })}`,
      );
      const json = await resp.json();
      Object.keys(json.query.results).forEach(async (key) => {
        charMemoryData.value.push({
          char: key,
          charEID: json.query.results[key].printouts["情报编号"][0] as string,
          rarity: json.query.results[key].printouts["稀有度"][0] as string,
          memories: [],
        });
      });
      charMemoryData.value.forEach((charm) => {
        fetch(`/rest.php/v1/page/${charm.char}`)
          .then((response) => response.json())
          .then((json) => {
            var rawdata = json.source as string;
            rawdata = rawdata.replaceAll("{{FULLPAGENAME}}", charm.char);
            const matches = rawdata.match(
              /{{干员密录\/list[\s\S]*?}}(?=\s{{干员密录|\s}})/gm,
            ) as string[];
            matches.forEach((str, key) => {
              charm.memories[key] = {
                elite: (str.match(/(?<=\|精英化=).*/) as string[])[0],
                level: (str.match(/(?<=\|等级=).*/) as string[])[0],
                favor: (str.match(/(?<=\|信赖=).*/) as string[])[0],
                medal: str.match(/(?<=\|蚀刻章override=).*/)
                  ? (str.match(/(?<=\|蚀刻章override=).*/) as string[])[0]
                  : "“" +
                    (str.match(/(?<=\|storySetName=).*/) as string[])[0] +
                    "”",
                name: (str.match(/(?<=\|storySetName=).*/) as string[])[0],
                info: [],
              };
              var i = 1;
              str = str.replace(/\|storyIntro=/, "|storyIntro1=");
              str = str.replace(/\|storyTxt=/, "|storyTxt1=");
              while (str.match(new RegExp(`storyIntro${i}`))) {
                charm.memories[key].info[i - 1] = {
                  intro: (
                    str.match(
                      new RegExp(`(?<=\\|storyIntro${i}=).*`),
                    ) as string[]
                  )[0],
                  link: (
                    str.match(new RegExp(`(?<=\\|storyTxt${i}=).*`)) as string[]
                  )[0],
                };
                i++;
              }
            });
          });
      });
    });
    return {
      theme,
      themeStore,
      i18nConfig,
      filterRarity,
      states,
      searchTerm,
      pagination,
      charMemoryData,
      filteredMemory,
      shownMemory,
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
            <div class="flex items-center">
              <NInput
                v-model:value="searchTerm"
                class="my-2"
                type="text"
                placeholder="搜索干员名称/密录名称/引言文字"
              />
              <div class="px-2" @click="themeStore.toggleDark()">
                <NButton>
                  <span v-if="theme" class="text-2xl mdi mdi-brightness-6" />
                  <span v-else class="text-2xl mdi mdi-brightness-4" />
                </NButton>
              </div>
            </div>
          </tr>
        </tbody>
        <NPagination
          class="justify-center my-2"
          :item-count="filteredMemory.length"
          :page="pagination.page"
          :page-size="pagination.pageSize"
          :page-sizes="pagination.pageSizes"
          :page-slot="pagination.pageSlot"
          :show-size-picker="pagination.showSizePicker"
          @update:page="pagination.onChange"
          @update:page-size="pagination.onUpdatePageSize"
        />
        <div class="w-full flex flex-col lg:flex-row flex-wrap">
          <Memory
            v-for="charm in shownMemory"
            :key="charm.char"
            :char-memory="charm"
          >
          </Memory>
        </div>
        <NPagination
          class="justify-center my-2"
          :item-count="filteredMemory.length"
          :page="pagination.page"
          :page-size="pagination.pageSize"
          :page-sizes="pagination.pageSizes"
          :page-slot="pagination.pageSlot"
          :show-size-picker="pagination.showSizePicker"
          @update:page="pagination.onChange"
          @update:page-size="pagination.onUpdatePageSize"
        />
      </table>
    </NLayout>
  </NConfigProvider>
</template>
