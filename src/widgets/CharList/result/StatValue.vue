<script setup lang="ts">
import { computed } from "vue";

import { splitUnit } from "../stats";

/** 一项数值；「70s」的单位排小一号 */
const props = defineProps<{ value: number | string }>();
const parts = computed(() => splitUnit(props.value));
</script>

<template>
  {{ parts[0] }}<small v-if="parts[1]">{{ parts[1] }}</small>
</template>
