<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import Block from "./Block.vue";
import { type XbConstData } from "./consts";

export interface Props {
  map: {
    options: Record<string, any>;
    mapData: Record<string, any>;
    predefines: Record<string, any>;
  };
  embed?: boolean;
  xbMapConst: XbConstData;
}

const props = withDefaults(defineProps<Props>(), {
  embed: false,
});

const tokens = computed(() => {
  const result: Record<string, any> = {};
  const tokenInsts = props.map?.predefines.tokenInsts || [];
  for (const token of tokenInsts) {
    const pos = token.position;
    const coord = `${pos.row}-${pos.col}`;
    result[coord] = result[coord] ?? [];
    result[coord].push(token.inst.characterKey.replaceAll(/trap_\d+_/g, ""));
  }
  return result;
});

const black = computed(() => {
  const result: Record<string, string> = {};
  const configBlackBoard = props.map?.options.configBlackBoard || [];
  for (const block of configBlackBoard) {
    const val = block.valueStr;
    if (val === null) continue;

    const pos = val.replaceAll(/\(|\)/g, "").split(",");
    if (pos.length === 4) {
      // let list = []
      for (let y = Number.parseInt(pos[0]); y <= Number.parseInt(pos[2]); y++) {
        for (
          let x = Number.parseInt(pos[1]);
          x <= Number.parseInt(pos[3]);
          x++
        ) {
          result[`${y}-${x}`] = "rect";
        }
      }
    }
  }

  return result;
});

function getTile(index: number) {
  let a = props.map?.mapData.tiles[index].tileKey.replace("tile_", "");
  if (a === "floor" || a === "road") {
    const buildableType = props.map?.mapData.tiles[index].buildableType;
    const isRoad =
      buildableType === 1 ||
      buildableType === "MELEE" ||
      buildableType === "ALL";
    a = isRoad ? "road" : "floor";
  }
  return a;
}

function getToken(row: number, col: number) {
  return tokens.value[`${row}-${col}`];
}

const rootRef = ref<HTMLElement>();
const fontsize = ref("");
const bordersize = ref("");
const width = computed(() => {
  const mapData = props.map.mapData;
  return mapData.width ?? mapData.map[0].length;
});

onMounted(() => {
  if (!rootRef.value || !props.map) return;

  fontsize.value = `${
    (rootRef.value.getBoundingClientRect().width /
      width.value /
      (props.embed ? 5 : 9)) *
    5
  }px`;

  bordersize.value = width.value <= 25 ? "2px" : "1px";
});
</script>

<template>
  <div :id="embed ? 'mapmodal' : 'map'" ref="rootRef" class="xbmap w-full">
    <div v-for="(row, i) in map.mapData.map" :key="i" class="row">
      <Block
        v-for="(board, n) in row"
        v-bind="black && black[`${map.mapData.map.length - 1 - i}-${n}`] ? { black: black[`${map.mapData.map.length - 1 - i}-${n}`] } : {}"
        :key="i * row.length + n"
        :tile="getTile(board)"
        :tile-height-type="map.mapData.tiles[board].heightType.toString()"
        :tokens="getToken(map.mapData.map.length - 1 - i, n)"
        :blockmap="xbMapConst.blockmap"
      />
    </div>
  </div>
</template>

<style scoped>
#map .row {
  display: grid;
  grid-template-columns: repeat(v-bind(width), 1fr);
}

#map :deep(.block span) {
  font-size: v-bind(fontsize);
}

#map :deep(.block) {
  border-width: v-bind(bordersize);
}

#mapmodal .row {
  display: grid;
  grid-template-columns: repeat(v-bind(width), 1fr);
}

#mapmodal :deep(.block span) {
  font-size: v-bind(fontsize);
}

#mapmodal :deep(.block) {
  border-width: v-bind(bordersize);
}
</style>
