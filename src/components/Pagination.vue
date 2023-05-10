<script lang="ts">
import { computed, defineComponent, ref, watch } from 'vue'
import CheckBox from './CheckBox.vue'
export default defineComponent({
  name: 'Pagination',
  components: {
    CheckBox,
  },
  props: {
    length: { type: Number, required: true },
    step: { type: String, required: true },
    index: { type: Number, required: true },
  },
  emits: ['update:index', 'update:step'],
  setup(props, { emit }) {
    const step_ = ref(props.step)
    const values = ref(['1'])
    const checkboxCount = computed(() =>
      Math.ceil(props.length / parseInt(props.step)),
    )

    watch(
      () => values.value,
      () =>
        emit('update:index', {
          index: parseInt(values.value[0]),
          step: step_,
        }),
      { deep: true },
    )
    watch(step_, (n, o) => emit('update:step', { n, o }))
    watch(
      () => props.index,
      () => (values.value[0] = props.index.toString()),
    )
    watch(
      () => checkboxCount.value,
      (newVal) => {
        if (newVal !== 0 && newVal < parseInt(values.value[0]))
          values.value[0] = newVal.toString()
      },
    )

    return {
      step_,
      values,
      checkboxCount,
    }
  },
})
</script>

<template>
  <div class="paginations-container">
    <select v-model="step_" name="length">
      <option value="50">
        50
      </option>
      <option value="100">
        100
      </option>
      <option value="200">
        200
      </option>
    </select>
    <div>共{{ length }}条</div>
    <div class="checkbox-container">
      <CheckBox
        v-for="k in checkboxCount"
        :key="k"
        v-model:states="values"
        :text="k.toString()"
        :only-one="true"
        :atleast-one="true"
      />
    </div>
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
