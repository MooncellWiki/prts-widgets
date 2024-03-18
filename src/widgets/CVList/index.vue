<script lang="ts">
import { defineComponent, nextTick, ref, type PropType } from "vue";

import { NConfigProvider, NTabPane, NTabs, type TabsInst } from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";

import VoiceLangTab from "./VoiceLangTab.vue";
import type { VoiceLangTypeData } from "./types";

export default defineComponent({
  components: { NConfigProvider, NTabs, NTabPane, VoiceLangTab },
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
    const tabs = ref(Object.values(props.langTypes).map((v) => v.name));
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

    return { theme, i18nConfig, valueRef, tabsInstRef, tabs, nameToKey };
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
      <n-tab-pane v-for="tab in tabs" :key="tab" :name="tab">
        <VoiceLangTab
          v-if="data"
          :voice-data="data[nameToKey[tab]]"
          :mapping="mapping"
        />
      </n-tab-pane>
    </n-tabs>
  </NConfigProvider>
</template>

<style scoped></style>
