<script setup lang="ts">
import { computed } from "vue";

import { useQuery } from "@pinia/colada";
import { NButton, NConfigProvider, NSpin } from "naive-ui";

import { useTheme } from "@/utils/theme";

import Simulator from "./Simulator.vue";
import { EMPTY_POOLS, gachaPoolQuery } from "./data";

/**
 * 抽卡模拟器：这一层取卡池数据、管读取中与失败，模拟本身在 Simulator.vue。
 * 读取中（含外壳预渲染）用常驻池的初始状态画出模拟器、盖一层转圈，点不动；失败时给重试。
 */
const props = defineProps<{
  gachaPoolId: string;
  gachaBannerFile: string;
}>();

const { theme, themeOverrides } = useTheme();
const {
  data: pools,
  status,
  isLoading,
  refetch,
} = useQuery(() => gachaPoolQuery(props.gachaPoolId));
const failed = computed(() => status.value === "error" && !isLoading.value);
</script>

<template>
  <Simulator
    v-if="pools"
    v-bind="pools"
    :gacha-pool-id="gachaPoolId"
    :gacha-banner-file="gachaBannerFile"
  />
  <NConfigProvider
    v-else
    preflight-style-disabled
    inline-theme-disabled
    :theme="theme"
    :theme-overrides="themeOverrides"
  >
    <div v-if="failed" class="mx-2 my-4">
      <NButton @click="refetch()">卡池数据读取失败，点击重试</NButton>
    </div>
    <NSpin v-else description="正在读取卡池数据…">
      <div inert>
        <Simulator
          v-bind="EMPTY_POOLS"
          :gacha-pool-id="gachaPoolId"
          :gacha-banner-file="gachaBannerFile"
        />
      </div>
    </NSpin>
  </NConfigProvider>
</template>
