<script setup lang="ts">
import { computed } from "vue";

import { AkPopover, AkScope } from "@mooncellwiki/prts-design-vue";
import { NDivider } from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath } from "@/utils/utils";

import type { CharMemory, Memory } from "./types";

const getSrcMedal = (mmr: Memory) =>
  `${TORAPPU_ENDPOINT}/assets/medal_icon/${mmr.medal.id}.png`;

const getSrcElite = (elite: string) =>
  getImagePath(`图标_升级_精英化${elite || "0"}.png`);
const props = withDefaults(
  defineProps<{
    charMemory: CharMemory;
    /** 内容区较窄：卡内文字收小一点 */
    narrow?: boolean;
  }>(),
  { narrow: false },
);

const src = computed(() => {
  const lowRarityImg = getImagePath(`头像_${props.charMemory.char}.png`);
  const highRarityImg = getImagePath(`头像_${props.charMemory.char}_2.png`);
  try {
    const rarity = Number.parseInt(props.charMemory.rarity);
    return rarity >= 3 ? highRarityImg : lowRarityImg;
  } catch {
    return lowRarityImg;
  }
});
const link = computed(() => {
  return `/w/${props.charMemory.char}`;
});
const srcfavor = getImagePath("图标_信赖.png");
const srcplay = getImagePath("情报处理室_播放按钮.png");
</script>

<template>
  <AkScope tag="div" :class="['ml-card', { 'ml-card--narrow': narrow }]">
    <div class="h-full flex flex-row items-center justify-center">
      <div
        class="min-w-[85px] flex basis-1/5 flex-col items-center justify-center"
      >
        <a :href="link">
          <img
            class="m-[2px] cursor-pointer"
            :src="src"
            width="60"
            height="60"
          />
        </a>
        <span class="text-sm">{{ charMemory.char }}</span>
      </div>
      <div class="flex basis-4/5 flex-col items-center justify-center">
        <div
          v-for="mmr in charMemory.memories"
          :key="mmr.name"
          class="w-full flex flex-col"
        >
          <div
            v-if="mmr.isNew"
            class="my-1 w-full flex flex-col bg-orange text-center text-white"
          >
            新增密录
          </div>
          <div
            class="w-full flex items-center bg-[#313131] py-[3px] text-3 text-white"
          >
            <div
              class="min-w-[4em] flex flex-wrap b-r-1 b-r-white b-r-solid px-1 md:min-w-[9.5em]"
            >
              <div class="flex items-center">
                <img width="15" class="pr-1" :src="getSrcElite(mmr.elite)" />
                <span class="font-bold">Lv.{{ mmr.level }}</span>
              </div>
              <div class="flex items-center">
                <img width="14" class="p-1" :src="srcfavor" />
                <span class="font-bold">{{ mmr.favor }}%</span>
              </div>
            </div>
            <div class="mx-1 w-full flex items-center justify-between">
              <span>{{ mmr.name }}</span>
              <AkPopover
                class="ml-medal-popover"
                trigger="hover"
                placement="top-end"
              >
                <template #trigger>
                  <div
                    class="w-[40] flex cursor-help items-center justify-center"
                    style="
                      border-radius: 3px;
                      background: linear-gradient(0deg, #ffffff38, transparent);
                    "
                  >
                    <span class="mdi mdi-medal text-4 text-white"></span>
                    <img :src="getSrcMedal(mmr)" width="20" />
                  </div>
                </template>
                <div class="ml-medal">
                  <img :src="getSrcMedal(mmr)" width="80" />
                  <span class="ml-medal__name">
                    {{ mmr.medal.medal }}
                  </span>
                  <span class="ml-medal__desc">
                    {{ mmr.medal.desc }}
                  </span>
                </div>
              </AkPopover>
            </div>
          </div>
          <div v-for="info in mmr.info" :key="info.link" class="flex flex-col">
            <NDivider v-if="info.link !== mmr.info[0].link" />
            <div class="flex flex-nowrap py-2">
              <div class="flex-basis-5/6">
                {{ info.intro }}
              </div>
              <div
                class="min-w-[4.5em] flex flex-basis-1/6 items-center justify-center"
              >
                <a :href="`/w/${info.link}`">
                  <img width="50" :src="srcplay" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AkScope>
</template>

<style scoped lang="scss">
// 奖章弹出卡：AkPopover 自己给表面 / 顶边主色条，这里只排图、名、说明
.ml-medal {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 220px;
  max-width: 100%;
  text-align: center;

  img {
    display: block;
  }
}

// 奖章卡保持改版前的深色底（不随亮色主题变白）
.ml-medal-popover {
  :deep(.ak-popover) {
    background: #2f2f2f;
    color: #fff;
  }

  .ml-medal__name {
    color: #fff;
  }

  .ml-medal__desc {
    color: rgba(255, 255, 255, 0.75);
  }
}

.ml-medal__name {
  padding-top: 6px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--ak-fg);
}

.ml-medal__desc {
  padding-top: 2px;
  font-size: var(--ak-fs-xs);
  line-height: 1.45;
  color: var(--ak-fg-secondary);
  font-style: italic;
}

// 原来的 NCard 外壳换成 AkScope；卡面用设计系统令牌自己画，内部内容不动
.ml-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: calc(100% - 0.5rem);
  margin: 0.25rem;
  padding: 0.5rem;
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);
  color: var(--ak-fg);
  transition:
    border-color var(--ak-dur-normal) var(--ak-ease),
    box-shadow var(--ak-dur-normal);

  &:hover {
    border-color: var(--ak-accent-muted);
    box-shadow: var(--ak-shadow-md);
  }

  @media (min-width: 1024px) {
    width: calc(50% - 0.5rem);
  }

  // 内容区窄：整体收 8% 左右；干员名用的是固定 rem 的 text-sm，按同一比例单独收
  &.ml-card--narrow {
    font-size: 0.92em;

    .text-sm {
      font-size: 0.8rem;
    }
  }
}
</style>
