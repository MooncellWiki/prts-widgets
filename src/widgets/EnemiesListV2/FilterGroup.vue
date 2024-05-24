<script lang="ts">
import type { PropType } from "vue";
import { defineComponent } from "vue";

import { useVModel } from "@vueuse/core";
import { NCard, NCollapseTransition } from "naive-ui";

import OptionsGroup from "@/components/OptionsGroup.vue";

export default defineComponent({
  name: "FilterGroup",
  components: {
    NCard,
    NCollapseTransition,
    OptionsGroup,
  },
  props: {
    show: Boolean,
    title: String,
    filters: {
      type: Object as PropType<{
        [field: string]: {
          title: string;
          options: string[];
        };
      }>,
      required: true,
    },
    states: {
      type: Object as PropType<Record<string, string[]>>,
      required: true,
    },
  },
  emits: ["update:collapsed", "update:states"],
  setup(props, { emit }) {
    const showRef = useVModel(props, "show", emit);
    const statesRef = useVModel(props, "states", emit);
    return {
      showRef,
      statesRef,
    };
  },
});
</script>

<template>
  <NCard :title="title" header-style="text-align: center;" size="small">
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
              v-model="statesRef[field]"
              :title="filter.title"
              :options="filter.options"
            />
          </tr>
        </tbody>
      </table>
    </NCollapseTransition>
  </NCard>
</template>
