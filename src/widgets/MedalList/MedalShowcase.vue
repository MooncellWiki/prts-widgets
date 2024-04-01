<script lang="ts">
import { PropType, computed, defineComponent, onMounted, ref } from "vue";

import {
  NButton,
  NCard,
  NConfigProvider,
  NEmpty,
  NGrid,
  NGridItem,
  NLayout,
  NTooltip,
} from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { getImagePath } from "@/utils/utils";

import MedalComponent from "./Medal.vue";
import MedalGroupComponent from "./MedalGroup.vue";
import type { MedalMetaData } from "./types";
import { getMedalMetaData } from "./utils";

export default defineComponent({
  components: {
    MedalComponent,
    MedalGroupComponent,
    NButton,
    NCard,
    NConfigProvider,
    NLayout,
    NGrid,
    NGridItem,
    NEmpty,
    NTooltip,
  },
  props: {
    medalList: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    medalGroupList: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    spoiler: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const medalMetaData = ref<MedalMetaData>({
      medal: {},
      medalGroup: {},
      category: {},
    });

    onMounted(async () => {
      medalMetaData.value = await getMedalMetaData();
    });

    const filteredMedalData = computed(() => {
      const medalGroup = Object.fromEntries(
        Object.entries(medalMetaData.value.medalGroup).filter(([gid]) => {
          return props.medalGroupList.includes(gid);
        }),
      );

      const medal = Object.fromEntries(
        Object.entries(medalMetaData.value.medal).filter(([id]) => {
          return props.medalList.includes(id);
        }),
      );

      return {
        medal,
        medalGroup,
      };
    });

    const generateGroupMedalData = (medalGroupId: string) => {
      return Object.values(
        medalMetaData.value.medalGroup[medalGroupId].medal,
      ).map((id) => {
        return medalMetaData.value.medal[id];
      });
    };

    const spoilerManualUnlocked = ref(!props.spoiler);

    const { theme, toggleDark } = useTheme();

    return {
      i18nConfig: getNaiveUILocale(),
      filteredMedalData,
      spoilerManualUnlocked,
      theme,
      toggleDark,
      getImagePath,
      generateGroupMedalData,
    };
  },
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :theme-overrides="{
      Button: {
        textColorTextHover: '#d97706',
        textColorTextFocus: '#d97706',
        textColorTextPressed: '#b45309',
        textColorHover: '#d97706',
        textColorFocus: '#d97706',
        textColorPressed: '#b45309',
        borderHover: '1px solid #d97706',
        borderFocus: '1px solid #d97706',
        borderPressed: '1px solid #b45309',
      },
    }"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <NLayout class="antialiased max-w-200">
      <NCard>
        <template #header>
          <img
            :src="getImagePath('图标_光荣之路.svg')"
            :class="`${theme ? 'brightness-100' : 'brightness-0'} transition-all`"
            width="25"
            class="mr-3"
          />
          <n-tooltip trigger="hover">
            <template #trigger>
              <NButton
                text
                class="text-lg decoration-none! align-middle"
                tag="a"
                href="/w/光荣之路"
              >
                光荣之路 <span class="mdi mdi-chevron-right"
              /></NButton>
            </template>
            点击前往【光荣之路】主页面
          </n-tooltip>
        </template>
        <template #header-extra>
          <div v-if="spoiler && spoilerManualUnlocked">
            <NButton @click="spoilerManualUnlocked = false">
              <span class="mdi mdi-lock-open-variant" />
            </NButton>
          </div>
        </template>
        <NGrid
          v-if="medalList.length === 0 && medalGroupList.length === 0"
          cols="1"
          :x-gap="12"
          :y-gap="8"
          responsive="screen"
        >
          <NGridItem span="1">
            <NEmpty>
              <template #default>
                <div class="text-center">
                  并没有任何蚀刻章，你是不是忘了配置了？<br />使用 medalgroup 与
                  medal 来配置要显示的蚀刻章套组与单章<br />使用半角分号（;）分隔
                  ID
                </div>
              </template>
            </NEmpty>
          </NGridItem>
        </NGrid>
        <NGrid
          v-else-if="!spoilerManualUnlocked"
          cols="1"
          :x-gap="12"
          :y-gap="8"
          responsive="screen"
        >
          <NGridItem span="1 l:2">
            <NEmpty class="bg-#424242">
              <template #icon>
                <div class="text-center">
                  <span class="mdi mdi-lock color-white p-0 font-size-2rem" />
                </div>
              </template>
              <template #default>
                <div class="text-center color-white pt-2">
                  以下内容需要验证权限后查阅<br /><span
                    class="mdi mdi-information-variant-circle"
                  />&nbsp;本活动关联蚀刻章已加密，请自行决定是否查看。
                </div>
              </template>
              <template #extra>
                <div class="text-center color-white pb-2">
                  <NButton
                    color="white"
                    text-color="#424242"
                    @click="spoilerManualUnlocked = true"
                  >
                    <span class="mdi mdi-key-variant" />&nbsp;移除加密
                  </NButton>
                </div>
              </template>
            </NEmpty>
          </NGridItem>
        </NGrid>
        <NGrid v-else cols="1" :x-gap="12" :y-gap="8" responsive="screen">
          <NGridItem v-for="medalId in medalList" :key="medalId">
            <MedalComponent
              v-if="filteredMedalData.medal[medalId]"
              :medal-data="filteredMedalData.medal[medalId]"
            />
          </NGridItem>
          <NGridItem v-for="medalGroupId in medalGroupList" :key="medalGroupId">
            <MedalGroupComponent
              v-if="filteredMedalData.medalGroup[medalGroupId]"
              :group-data="filteredMedalData.medalGroup[medalGroupId]"
              :medal-data-list="generateGroupMedalData(medalGroupId)"
            />
          </NGridItem>
        </NGrid>
      </NCard>
    </NLayout>
  </NConfigProvider>
</template>

<style scoped>
a {
  color: unset;
}
</style>
