<script lang="ts">
import type { PropType } from "vue";
import { computed, defineComponent, provide } from "vue";

export default defineComponent({
  props: {
    modelValue: {
      type: [Object, String] as PropType<Record<string, boolean> | string>,
      required: true,
    },
    // radio模式 只能选一个而且至少选一个
    isRadio: { type: Boolean },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const stateMap = computed(() => {
      if (props.isRadio) {
        return {
          [props.modelValue as string]: true,
        };
      }
      return props.modelValue as Record<string, boolean>;
    });
    function setState(value: string, state: boolean) {
      if (!props.isRadio) {
        stateMap.value[value] = state;
        emit("update:modelValue", stateMap.value);
        return;
      }
      if (stateMap.value[value] && !state) return;

      if (!stateMap.value[value] && state) {
        Object.keys(stateMap.value).find((key) => {
          if (stateMap.value[key]) {
            stateMap.value[key] = false;
            return true;
          }
          return false;
        });
        stateMap.value[value] = true;
        emit("update:modelValue", value);
      }
    }
    provide("check-box-group", { state: stateMap, setState });
  },
});
</script>

<template>
  <div>
    <slot />
  </div>
</template>
