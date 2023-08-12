<script lang="ts">
import { useVModel } from '@vueuse/core'
import { NButton } from 'naive-ui'
import { type PropType, defineComponent } from 'vue'

export default defineComponent({
  name: 'SingleFilter',
  components: { NButton },
  props: {
    title: String,
    options: { type: Array as PropType<string[]>, required: true },
    modelValue: { type: Array as PropType<string[]>, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const modelValue = useVModel(props, 'modelValue', emit, {
      passive: true,
      deep: true,
    })
    const onTagClick = (option: string) => {
      return modelValue.value.includes(option)
        ? modelValue.value.splice(modelValue.value.indexOf(option), 1)
        : modelValue.value.push(option)
    }
    const selectAll = () =>
      props.options.forEach(
        option =>
          !modelValue.value.includes(option) && modelValue.value.push(option),
      )
    const selectNone = () => modelValue.value.splice(0)
    return {
      modelValue,
      selectAll,
      selectNone,
      onTagClick,
    }
  },
})
</script>

<template>
  <div class="flex flex-row justify-center items-center">
    <span class="basis-1/8">{{ title }}</span>
    <div class="flex flex-row items-center basis-7/8">
      <div class="flex flex-col lg:flex-row">
        <NButton class="m-1" @click="selectAll()">
          全选
        </NButton>
        <NButton class="m-1" @click="selectNone()">
          清除
        </NButton>
      </div>
      <div>
        <NButton
          v-for="(option, index) in options"
          :key="index"
          strong
          secondary
          :type="modelValue.includes(option) ? 'info' : 'default'"
          class="m-1"
          @click="onTagClick(option)"
        >
          {{ option }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
