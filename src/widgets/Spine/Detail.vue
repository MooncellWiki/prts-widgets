<script lang="ts">
import type { PropType } from 'vue'
import { defineComponent } from 'vue'

export default defineComponent({
  props: {
    detailes: Array as PropType<
      {
        duration: number
        name: string
      }[]
    >,
  },
  setup() {
    function round(x: number) {
      return Math.round(x)
    }
    return { round }
  },
})
</script>

<template>
  <table class="wikitable w-full">
    <thead>
      <tr>
        <th>动画</th>
        <th>持续时间(s)</th>
        <th>帧数(30/s)</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="detail in detailes" :key="detail.name">
        <td>{{ detail.name }}</td>
        <td>{{ detail.duration }}</td>
        <td>{{ round(detail.duration * 30) }}</td>
      </tr>
    </tbody>
  </table>
</template>
