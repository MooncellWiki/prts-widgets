<script lang="ts">
import { defineComponent, nextTick, ref, type PropType, onMounted } from "vue";

import {
  NConfigProvider,
  NTabPane,
  NTabs,
  type TabsInst,
  NTooltip,
} from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";

import VoiceLangTab from "./VoiceLangTab.vue";
import type { VoiceLangTypeData } from "./types";
import { getCVConfig } from "./types";

export default defineComponent({
  components: { NConfigProvider, NTabs, NTabPane, NTooltip, VoiceLangTab },
  props: {
    data: {
      type: Object as PropType<Record<string, Record<string, string[]>>>,
      required: true,
    },
    langTypes: {
      type: Object as PropType<VoiceLangTypeData>,
      required: true,
    },
    mapping: {
      type: Object as PropType<Record<string, string>>,
      required: true,
    },
  },
  setup(props) {
    const { theme } = useTheme();
    const i18nConfig = getNaiveUILocale();
    const tabsInstRef = ref<TabsInst | null>(null);
    const tabs = ref(
      Object.values(props.langTypes)
        .map((v) => v.name)
        .filter((v) => {
          return v != "联动";
        })
        .concat("联动"),
    );
    const valueRef = ref(tabs.value[0]);
    const nameToKey = Object.fromEntries(
      Object.entries(props.langTypes).map(([key, value]) => [value.name, key]),
    );

    if (window.location.hash) {
      const [lang, name] = decodeURIComponent(window.location.hash).split("：");
      valueRef.value = lang.slice(1);
      nextTick(() => {
        tabsInstRef.value?.syncBarPosition();
        document.querySelector(`#${name}`)?.scrollIntoView();
      });
    }
    const cvConfig = ref({});
    onMounted(async () => {
      cvConfig.value = await getCVConfig();
    });

    return {
      theme,
      i18nConfig,
      valueRef,
      tabsInstRef,
      tabs,
      nameToKey,
      cvConfig,
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
    <n-tabs ref="tabsInstRef" v-model:value="valueRef" type="line" animated>
      <n-tab-pane
        v-for="tab in tabs"
        :key="tab"
        :name="tab == '联动' ? '联动语音' : tab"
      >
        <template #tab>
          <n-tooltip
            v-if="cvConfig.langDisplay && tab in cvConfig.langDisplay"
            trigger="hover"
          >
            <template #trigger>{{ tab }}</template>
            {{ cvConfig.langDisplay[tab] }}
          </n-tooltip>
          <n-tooltip
            v-else-if="tab == '联动'"
            trigger="hover"
            :arrow-style="{ background: 'orange' }"
            :style="{ border: '1px solid orange' }"
          >
            <template #trigger>联动</template>
            <span class="mdi mdi-handshake mdi-rotate-45 color-orange"></span>
          </n-tooltip>
          <span v-else>
            {{ tab }}
          </span>
        </template>
        <VoiceLangTab
          v-if="data"
          :lang="tab"
          :voice-data="data[nameToKey[tab]]"
          :mapping="mapping"
          :lang-types="langTypes"
          :cv-config="cvConfig || {}"
        />
      </n-tab-pane>
    </n-tabs>
  </NConfigProvider>
</template>

<style scoped></style>
