<script setup lang="ts">
import { computed } from "vue";

import Checkbox from "./Checkbox.vue";
import CheckboxGroup from "./CheckboxGroup.vue";
const props = defineProps<{
  length: number;
  step: number;
  index: number;
}>();
const emit = defineEmits<{
  "update:index": [number];
  "update:step": [{ n: number; o: number }];
}>();

const checkboxCount = computed(() => {
  return Math.ceil(props.length / props.step);
});

const cur = computed({
  get() {
    return `${props.index}`;
  },
  set(v) {
    emit("update:index", Number.parseInt(v));
  },
});
const curStep = computed({
  get() {
    return props.step;
  },
  set(v) {
    emit("update:step", { n: v, o: curStep.value });
  },
});
</script>

<template>
  <div class="paginations-container">
    <select v-model="curStep" name="length">
      <option :value="50">50</option>
      <option :value="100">100</option>
      <option :value="200">200</option>
    </select>
    <div>共{{ length }}条</div>
    <CheckboxGroup v-model="cur" class="checkbox-container" is-radio>
      <Checkbox v-for="k in checkboxCount" :key="k" :value="k.toString()">
        {{ k }}
      </Checkbox>
    </CheckboxGroup>
  </div>
</template>

<style scoped>
.paginations-container {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
select {
  width: 70px;
  height: 28px;
  outline: 0;
  margin: 5px 0;
}
.paginations-container .checkbox-container > div {
  margin: 0.3em;
  width: 28px;
  border-radius: 28px;
  min-width: 0px !important;
  padding: 0 !important;
  letter-spacing: 0 !important;
  text-indent: -0.05em !important;
}
</style>
