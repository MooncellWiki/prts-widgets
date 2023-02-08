<script lang="ts">
import { computed, defineComponent, ref } from 'vue'
export default defineComponent({
  name: 'CheckBox',
  props: {
    states: { type: Array<string>, required: true },
    text: { type: String, required: true },
    atLeastOne: Boolean,
    onlyOne: Boolean,
    noWidth: Boolean,
  },
  setup(props, { emit }) {
    const onClick = function () {
      const states = ref(props.states)
      const i: number = props.states?.indexOf(props.text)

      if (props.atLeastOne && i !== -1)
        return

      if (props.onlyOne) {
        states.value = [props.text]
        emit('update:states', states.value)
        return
      }

      if (i !== -1)
        states.value.splice(i, 1)
      else
        states.value.push(props.text)

      emit('update:states', states.value)
    }

    const selected = computed(() => {
      if (props.states)
        return props.states.includes(props.text)
      else
        return false
    })
    return { selected, onClick }
  },
})
</script>

<template>
  <div
    :class="{
      selected,
      nowidth: noWidth,
    }"
    class="checkbox-container"
    @click="onClick"
  >
    {{ text }}
  </div>
</template>

<style scoped>
.checkbox-container {
  width: 70px;
  background-color: #313131;
  color: #ffffff;
  height: 28px;
  min-width: 40px;
  padding: 0 8px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  box-shadow: 0 3px 5px grey;
  letter-spacing: 0.08em;
  text-indent: 0.08em;
  cursor: pointer;
}
.selected {
  background-color: #0098dc;
}
.nowidth {
  width: initial;
}
</style>
