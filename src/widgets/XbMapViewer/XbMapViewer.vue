<template>
  <div id="map" ref="self" class="w-1/2">
    <div v-for="(row, i) in mapData.map" :key="i" class="row">
      <Block
        v-for="(board, n) in row"
        :key="n"
        :tile="getTile(board)"
        :tileHeightType="mapData.tiles[board].height"
        :token="getToken(mapData.height - 1 - i, n)"
        :black="black[`${mapData.height - 1 - i}-${n}`]"
      ></Block>
    </div>
  </div>
</template>
<script lang="ts">
import { computed, defineComponent, onMounted, PropType, ref } from 'vue'
import Block from './Block.vue'
export default defineComponent({
  components: { Block },
  props: {
    data: Object as PropType<{
      options: Record<string, any>
      mapData: Record<string, any>
      predefines: Record<string, any>
    }>,
  },
  setup(props) {
    const tokens = computed(() => {
      const result: Record<string, string> = {}
      props.data?.predefines.tokenInsts.forEach((token: any) => {
        let pos = token.position
        result[pos.row + '-' + pos.col] = token.inst.characterKey.replace(
          /trap_[0-9]+_/g,
          '',
        )
      })
      return result
    })
    const black = computed(() => {
      const result: Record<string, string> = {}
      props.data?.options.configBlackBoard.forEach((block: any) => {
        const val = block.valueStr
        if (val === null) {
          return
        }
        let pos = val.replace(/\(|\)/g, '').split(',')
        if (pos.length == 4) {
          // let list = []
          for (let y = parseInt(pos[0]); y <= parseInt(pos[2]); y++) {
            for (let x = parseInt(pos[1]); x <= parseInt(pos[3]); x++) {
              // list.push([y, x])
              result[y + '-' + x] = 'rect'
            }
          }
        }
      })
      return result
    })
    function getTile(index: number) {
      return props.data?.mapData.tiles[index].tileKey.replace('tile_', '')
    }
    function getToken(row: number, col: number) {
      return tokens.value[`${row}-${col}`]
    }
    const self = ref<HTMLElement>()
    const fontsize = ref('')
    onMounted(() => {
      if (!self.value || !props.data) {
        return
      }
      fontsize.value = `${
        (self.value.clientHeight / props.data.mapData.width / 4) * 3
      }px`
    })
    return {
      mapData: props.data!.mapData,
      width: props.data!.mapData.width,
      predefines: props.data!.predefines,
      black,
      self,
      fontsize,
      getTile,
      getToken,
    }
  },
})
</script>
<style scoped>
.row {
  display: grid;
  grid-template-columns: repeat(v-bind(width), 1fr);
}
:deep(.block span) {
  font-size: v-bind(fontsize);
}
</style>
