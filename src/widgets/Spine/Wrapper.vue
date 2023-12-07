<script lang="ts">
import type { PropType } from "vue";
import { defineComponent, ref, watch } from "vue";

import { NButton, NConfigProvider, zhCN } from "naive-ui";

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
export default defineComponent({
  components: {
    NConfigProvider,
    NButton,
    // NDialogProvider,
    Spine,
  },
  props: {
    conf: Object as PropType<Props>,
    id: String,
  },
  setup(props) {
    const loaded = ref(false);
    const value = ref<Props>();
    value.value = props.conf;
    watch(props, () => {
      value.value = props.conf;
    });
    async function load() {
      if (props.id) {
        const resp = await fetch(
          `https://torappu.prts.wiki/assets/charSpine/${props.id}/meta.json`,
        );
        value.value = await resp.json();
      }
      loaded.value = true;
    }
    return {
      value,
      loaded,
      zhCN,
      load,
    };
  },
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :breakpoints="{ s: 640, m: 768, lg: 1024, xl: 1280, xxl: 1536 }"
    :theme-overrides="{ common: { primaryColor: '#6a6aff' } }"
    :locale="zhCN"
  >
    <!-- <n-dialog-provider> -->
    <Spine
      v-if="loaded"
      :prefix="value!.prefix"
      :name="value!.name"
      :skin="value!.skin"
    />
    <NButton v-else type="info" @click="load"> 点此载入模型 </NButton>
    <!-- </n-dialog-provider> -->
  </NConfigProvider>
</template>
