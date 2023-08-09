<script lang="ts">
import { useVModel } from '@vueuse/core'
import { NButton } from 'naive-ui'
import { type PropType, defineComponent } from 'vue'

export default defineComponent({
  name: 'FilterGroup',
  components: { NButton },
  props: {
    title: String,
    options: Array as PropType<string[]>,
    modelValue: { type: Array as PropType<string[]>, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const modelValue = useVModel(props, 'modelValue', emit, {
      passive: true,
      deep: true,
    })
    const handleClick = (option: string) => {
      return modelValue.value.includes(option)
        ? modelValue.value.splice(modelValue.value.indexOf(option), 1)
        : modelValue.value.push(option)
    }
    return {
      modelValue,
      handleClick,
    }
  },
})
</script>

<template>
  <div class="flex flex-row justify-center items-center">
    <span class="basis-1/8">{{ title }}</span>
    <div class="flex flex-row items-center basis-7/8">
      <div class="flex flex-col lg:flex-row">
        <NButton class="m-1">
          全选
        </NButton>
        <NButton class="m-1">
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
          @click="() => handleClick(option)"
        >
          {{ option }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
