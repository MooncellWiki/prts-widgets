<script setup lang="ts">
import { ref, watch } from "vue";

import { NButton, NConfigProvider, zhCN } from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { useTheme } from "@/utils/theme";

import Spine from "./Spine.vue";

export interface Props {
  prefix: string;
  name: string;
  skin: {
    [key: string]: {
      [key: string]: {
        file: string;
        skin?: string;
      };
    };
  };
}
const props = defineProps<{
  conf?: Props;
  id: string;
}>();

const loaded = ref(false);
const { theme, isDark } = useTheme();
const value = ref<Props>();
value.value = props.conf;
watch(props, () => {
  value.value = props.conf;
});
async function load() {
  if (props.id) {
    const resp = await fetch(
      `${TORAPPU_ENDPOINT}/assets/char_spine/${props.id}/meta.json`,
    );
    value.value = await resp.json();
  }
  loaded.value = true;
}
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :breakpoints="{ s: 640, m: 768, lg: 1024, xl: 1280, xxl: 1536 }"
    :theme="theme"
    :theme-overrides="{ common: { primaryColor: '#6a6aff' } }"
    :locale="zhCN"
  >
    <div :class="['spine-viewer-widget', isDark && 'prts-widget-dark']">
      <!-- <n-dialog-provider> -->
      <Spine
        v-if="loaded"
        :prefix="value!.prefix"
        :name="value!.name"
        :skin="value!.skin"
      />
      <NButton v-else type="info" @click="load"> 点此载入模型 </NButton>
      <!-- </n-dialog-provider> -->
    </div>
  </NConfigProvider>
</template>

<style scoped>
@import "../dark-mode.css";
</style>
