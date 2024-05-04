<script lang="ts">
import type { PropType } from "vue";
import { computed, defineComponent, onMounted, ref } from "vue";

import Block from "./Block.vue";
export default defineComponent({
  components: { Block },
  props: {
    map: Object as PropType<{
      options: Record<string, any>;
      mapData: Record<string, any>;
      predefines: Record<string, any>;
    }>,
  },
  setup(props) {
    const tokens = computed(() => {
      const result: Record<string, any> = {};
      const tokenInsts = props.map?.predefines.tokenInsts || [];
      for (const token of tokenInsts) {
        const pos = token.position;
        const coord = `${pos.row}-${pos.col}`;
        result[coord] = result[coord] ?? [];
        result[coord].push(
          token.inst.characterKey.replaceAll(/trap_\d+_/g, ""),
        );
      }
      return result;
    });
    const black = computed(() => {
      const result: Record<string, string> = {};
      const configBlackBoard = props.map?.options.configBlackBoard || [];
      for (const block of configBlackBoard) {
        const val = block.valueStr;
        if (val === null) return;

        const pos = val.replaceAll(/\(|\)/g, "").split(",");
        if (pos.length === 4) {
          // let list = []
          for (
            let y = Number.parseInt(pos[0]);
            y <= Number.parseInt(pos[2]);
            y++
          ) {
            for (
              let x = Number.parseInt(pos[1]);
              x <= Number.parseInt(pos[3]);
              x++
            ) {
              // list.push([y, x])
              result[`${y}-${x}`] = "rect";
            }
          }
        }
      }
      return result;
    });
    function getTile(index: number) {
      let a = props.map?.mapData.tiles[index].tileKey.replace("tile_", "");
      if (a === "floor" || a === "road")
        a =
          props.map?.mapData.tiles[index].buildableType === 1 ||
          props.map?.mapData.tiles[index].buildableType === "MELEE" ||
          props.map?.mapData.tiles[index].buildableType === "ALL"
            ? "road"
            : "floor";
      return a;
    }
    function getToken(row: number, col: number) {
      return tokens.value[`${row}-${col}`];
    }
    const self = ref<HTMLElement>();
    const fontsize = ref("");
    const width = computed(() => {
      return props.map!.mapData.width ?? props.map!.mapData.map[0].length;
    });
    onMounted(() => {
      if (!self.value || !props.map) return;

      fontsize.value = `${
        (self.value.getBoundingClientRect().width / width.value / 9) * 5
      }px`;
    });
    return {
      mapData: props.map!.mapData,
      width,
      predefines: props.map!.predefines,
      black,
      self,
      fontsize,
      getTile,
      getToken,
    };
  },
});
</script>

<template>
  <div id="map" ref="self" class="w-full">
    <div v-for="(row, i) in mapData.map" :key="i" class="row">
      <Block
        v-for="(board, n) in row"
        :key="n"
        :tile="getTile(board)"
        :tile-height-type="mapData.tiles[board].heightType"
        :tokens="getToken(mapData.map.length - 1 - i, n)"
        :black="black && black[`${mapData.map.length - 1 - i}-${n}`]"
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
