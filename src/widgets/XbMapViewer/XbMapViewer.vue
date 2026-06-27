<script setup lang="ts">
import { computed, onBeforeMount, ref } from "vue";

import { NModal, NButton, NConfigProvider, NSkeleton } from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";

import Map, { type Props } from "./Map.vue";
import { getConstData, type XbConstData } from "./consts";

const xbMapConst = ref<XbConstData>();
onBeforeMount(async () => {
  xbMapConst.value = await getConstData();
});
const { theme, isDark } = useTheme();
const i18nConfig = getNaiveUILocale();

const props = defineProps<Pick<Props, "map">>();

const width = computed(() => {
  const mapData = props.map.mapData;
  return mapData.width ?? mapData.map[0].length;
});
const showModal = ref(false);
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <div v-if="xbMapConst" :class="[isDark && 'prts-widget-dark']">
      <Map :map="map" :xb-map-const="xbMapConst"></Map>
      <div v-if="width >= 25">
        <NButton
          quaternary
          class="float-right mt-1 h-2em justify-end lt-sm:hidden"
          @click="showModal = true"
        >
          <i class="mdi mdi-magnify-plus-outline"></i> 放大查看
        </NButton>
        <NModal
          v-model:show="showModal"
          class="custom-card h-full max-w-[1200px] w-full"
          preset="card"
          size="small"
          :bordered="false"
          :block-scroll="false"
        >
          <template #header>
            <i class="mdi mdi-map"></i>
          </template>
          <Map :map="map" embed :xb-map-const="xbMapConst"></Map>
        </NModal>
      </div>
    </div>
    <NSkeleton v-else class="h-xs"></NSkeleton>
  </NConfigProvider>
</template>

<style scoped>
@import "../dark-mode.css";
</style>
