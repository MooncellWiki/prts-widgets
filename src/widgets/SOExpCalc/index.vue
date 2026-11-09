<script setup lang="ts">
import { computed } from "vue";

import { useQuery } from "@pinia/colada";

import SOECButton from "./SOECButton.vue";
import SOExpCalc from "./SOExpCalc.vue";
import { soExpMapQuery } from "./data";

/** 特勤经验计算：这一层取经验表、管读取中与失败，计算器本身在 SOExpCalc.vue */
const props = defineProps<{
  /** 干员的游戏内 ID */
  opid: string;
}>();

const {
  data: expMap,
  status,
  isLoading,
  refetch,
} = useQuery(() => soExpMapQuery(props.opid));
const failed = computed(() => status.value === "error" && !isLoading.value);
</script>

<template>
  <SOExpCalc v-if="expMap" :exp-map="expMap" />
  <SOECButton v-else-if="failed" @click="refetch()">
    特勤经验计算（读取失败，点此重试）
  </SOECButton>
  <!-- 不是特勤干员（expMap 为 null）时什么都不出 -->
  <SOECButton v-else-if="expMap === undefined" class="cursor-wait!">
    特勤经验计算（读取中…）
  </SOECButton>
</template>
