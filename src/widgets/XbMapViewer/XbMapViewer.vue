<script lang="ts">
import type { PropType } from 'vue'
import { computed, defineComponent, onMounted, ref } from 'vue'
import Block from './Block.vue'
export default defineComponent({
  components: { Block },
  props: {
    map: Object as PropType<{
      options: Record<string, any>
      mapData: Record<string, any>
      predefines: Record<string, any>
    }>,
  },
  setup(props) {
    const tokens = computed(() => {
      const result: Record<string, any> = {}
      props.map?.predefines.tokenInsts.forEach((token: any) => {
        const pos = token.position
        const coord = `${pos.row}-${pos.col}`
        result[coord] = result[coord] ?? []
        result[coord].push(token.inst.characterKey.replace(
          /trap_[0-9]+_/g,
          '',
        ))
      })
      return result
    })
    const black = computed(() => {
      const result: Record<string, string> = {}
      props.map?.options.configBlackBoard.forEach((block: any) => {
        const val = block.valueStr
        if (val === null)
          return

        const pos = val.replace(/\(|\)/g, '').split(',')
        if (pos.length === 4) {
          // let list = []
          for (let y = parseInt(pos[0]); y <= parseInt(pos[2]); y++) {
            for (let x = parseInt(pos[1]); x <= parseInt(pos[3]); x++) {
              // list.push([y, x])
              result[`${y}-${x}`] = 'rect'
            }
          }
        }
      })
      return result
    })
    function getTile(index: number) {
      return props.map?.mapData.tiles[index].tileKey.replace('tile_', '')
    }
    function getToken(row: number, col: number) {
      return tokens.value[`${row}-${col}`]
    }
    const self = ref<HTMLElement>()
    const fontsize = ref('')
    onMounted(() => {
      if (!self.value || !props.map)
        return

      fontsize.value = `${
        (self.value.clientWidth / props.map.mapData.width / 4) * 3
      }px`
    })
    return {
      mapData: props.map!.mapData,
      width: props.map!.mapData.width,
      predefines: props.map!.predefines,
      black,
      self,
      fontsize,
      getTile,
      getToken,
    }
  },
})
</script>

<template>
  <div id="map" ref="self" class="w-full">
    <div v-for="(row, i) in mapData.map" :key="i" class="row">
      <Block
        v-for="(board, n) in row"
        :key="n"
        :tile="getTile(board)"
        :tileHeightType="mapData.tiles[board].height"
        :tokens="getToken(mapData.height - 1 - i, n)"
        :black="black[`${mapData.height - 1 - i}-${n}`]"
      />
    </div>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: repeat(v-bind(width), 1fr);
}
:deep(.block span) {
  font-size: v-bind(fontsize);
}
</style>
