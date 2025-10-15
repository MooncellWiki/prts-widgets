<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { getImagePath } from "@/utils/utils";

import { type BlockDefine } from "./consts";

const props = withDefaults(
  defineProps<{
    tile: string;
    tileHeightType: string;
    tokens?: string[];
    black?: string;
    blockmap: Record<string, BlockDefine>;
  }>(),
  {
    black: "",
  },
);

const self = ref();

const style = computed(() => {
  const result: Record<string, string> = {};

  const tileBlock = props.blockmap[props.tile];
  if (tileBlock?.img) {
    result.backgroundImage = `url(${getImagePath(tileBlock.img)})`;
  }

  for (const token of props.tokens || []) {
    const tokenBlock = props.blockmap[token];
    if (tokenBlock?.img)
      result.backgroundImage = `url(${getImagePath(tokenBlock.img)})`;
  }

  if (
    props.tile === "grass" &&
    (props.tileHeightType === "1" || props.tileHeightType === "HIGHLAND")
  ) {
    result.boxShadow = "5px 5px 8px black";
    result.filter = "brightness(1.15)";
    result.zIndex = "2";
  }

  return result;
});

onMounted(() => {
  let content = "";
  const tileBlock = props.blockmap[props.tile];
  if (props.tile && tileBlock?.desc) content += tileBlock.desc;

  for (const token of props.tokens || []) {
    const tokenBlock = props.blockmap[token];
    if (token && tokenBlock?.desc)
      content += content
        ? `<br/> ${tokenBlock.desc}`
        : ` ${props.blockmap[token].desc}`;
  }

  if (content.length > 0) {
    // @ts-expect-error tippy

    tippy6(self.value, {
      allowHTML: true,
      content,
      arrow: true,
      theme: "light-border",
      size: "large",
      maxWidth: 250,
    });
  }
});
</script>

<template>
  <div
    ref="self"
    :class="[
      'block',
      tile,
      tokens ? `token ${tokens.toString().replace(/,/g, ' ')}` : '',
      black,
    ]"
    :style="style"
  >
    <template v-if="tokens">
      <template v-for="(token, i) in tokens" :key="i">
        <span v-if="blockmap[token]?.icon">
          <i :class="blockmap[token]!.icon" />
        </span>
      </template>
    </template>
    <template v-else>
      <span v-if="blockmap[tile]?.icon">
        <i :class="blockmap[tile]!.icon" />
      </span>
    </template>
  </div>
</template>

<style scoped>
.block {
  display: inline-block;
  position: relative;
  background-color: gray;
}

@media screen and (max-width: 540px) {
  .block {
    border-width: 1px !important;
    border-style: none;
    border-color: transparent;
  }
}

.block:before {
  content: "";
  display: block;
  padding-top: 100%;
}

.block span {
  position: absolute;
  /*font-weight: bold;*/
  font-family: initial;
  color: white;
  pointer-events: none;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.token {
  background-position: center;
  background-size: contain;
  background-repeat: no-repeat;
}

.rect {
  filter: opacity(0.75);
}

.empty {
  background-color: transparent;
}
</style>
