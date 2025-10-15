<script setup lang="ts">
import { useVModel } from "@vueuse/core";
import { NCard, NCollapseTransition } from "naive-ui";

import OptionsGroup from "@/components/OptionsGroup.vue";
const props = defineProps<{
  show?: boolean;
  title?: string;
  filters: Record<
    string,
    {
      title: string;
      options: string[];
    }
  >;
  states: Record<string, string[]>;
}>();
const emit = defineEmits<{
  "update:collapsed": [boolean];
  "update:states": [Record<string, string[]>];
}>();

const showRef = useVModel(props, "show", emit);
const statesRef = useVModel(props, "states", emit);
</script>

<template>
  <NCard
    v-bind="title ? { title } : {}"
    header-style="text-align: center;"
    size="small"
  >
    <template #header-extra>
      <div @click="showRef = !showRef">
        <span v-if="showRef" class="mdi mdi-chevron-up text-2xl" />
        <span v-else class="mdi mdi-chevron-down text-2xl" />
      </div>
    </template>
    <NCollapseTransition :show="showRef">
      <table class="w-full border-collapse text-left">
        <tbody class="align-baseline">
          <tr v-for="(filter, field) in filters" :key="field">
            <OptionsGroup
              v-bind="statesRef[field] ? { modelValue: statesRef[field] } : {}"
              :title="filter.title"
              :options="filter.options"
              @update:model-value="(v: string[]) => statesRef[field] = v"
            />
          </tr>
        </tbody>
      </table>
    </NCollapseTransition>
  </NCard>
</template>
