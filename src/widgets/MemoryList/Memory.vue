<script setup lang="ts">
import { computed } from "vue";

import { AkDivider, AkPopover, AkScope } from "@mooncellwiki/prts-design-vue";

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
    <div class="ml-memory">
      <div class="ml-memory__avatar">
        <a :href="link">
          <img
            class="ml-memory__avatar-img"
            :src="src"
            width="60"
            height="60"
          />
        </a>
        <span class="ml-memory__char">{{ charMemory.char }}</span>
      </div>
      <div class="ml-memory__body">
        <div
          v-for="mmr in charMemory.memories"
          :key="mmr.name"
          class="ml-memory__set"
        >
          <div v-if="mmr.isNew" class="ml-memory__new">新增密录</div>
          <div class="ml-memory__head">
            <div class="ml-memory__levels">
              <div class="ml-memory__level">
                <img
                  width="15"
                  class="ml-memory__level-icon"
                  :src="getSrcElite(mmr.elite)"
                />
                <span class="ml-memory__strong">Lv.{{ mmr.level }}</span>
              </div>
              <div class="ml-memory__level">
                <img width="14" class="ml-memory__favor-icon" :src="srcfavor" />
                <span class="ml-memory__strong">{{ mmr.favor }}%</span>
              </div>
            </div>
            <div class="ml-memory__name-row">
              <span>{{ mmr.name }}</span>
              <AkPopover
                class="ml-medal-popover"
                trigger="hover"
                placement="top-end"
              >
                <template #trigger>
                  <div class="ml-memory__medal-trigger">
                    <span class="mdi mdi-medal ml-memory__medal-icon"></span>
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
          <div
            v-for="info in mmr.info"
            :key="info.link"
            class="ml-memory__info"
          >
            <AkDivider
              v-if="info.link !== mmr.info[0].link"
              class="ml-memory__divider"
            />
            <div class="ml-memory__intro-row">
              <div class="ml-memory__intro">
                {{ info.intro }}
              </div>
              <div class="ml-memory__play">
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
// 干员列 + 右侧密录行：原 UnoCSS 布局改成这里的 scoped 样式
.ml-memory {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.ml-memory__avatar {
  display: flex;
  flex: 0 1 20%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 85px;
}

.ml-memory__avatar-img {
  margin: 2px;
  cursor: pointer;
}

.ml-memory__char {
  font-size: var(--ak-fs-sm);
}

.ml-memory__body {
  display: flex;
  flex: 0 1 80%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.ml-memory__set {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.ml-memory__new {
  width: 100%;
  margin: 0.25rem 0;
  background: #fb923c;
  color: #fff;
  text-align: center;
}

.ml-memory__head {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 3px 0;
  background: #313131;
  color: #fff;
  font-size: 0.75rem;
}

.ml-memory__levels {
  display: flex;
  flex-wrap: wrap;
  min-width: 4em;
  padding: 0 0.25rem;
  border-right: 1px solid #fff;
}

@media (min-width: 768px) {
  .ml-memory__levels {
    min-width: 9.5em;
  }
}

.ml-memory__level {
  display: flex;
  align-items: center;
}

.ml-memory__level-icon {
  padding-right: 0.25rem;
}

.ml-memory__favor-icon {
  padding: 0.25rem;
}

.ml-memory__strong {
  font-weight: 700;
}

.ml-memory__name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin: 0 0.25rem;
}

.ml-memory__medal-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: help;
  border-radius: 3px;
  background: linear-gradient(0deg, #ffffff38, transparent);
}

.ml-memory__medal-icon {
  color: #fff;
  font-size: 1rem;
}

.ml-memory__info {
  display: flex;
  flex-direction: column;
}

.ml-memory__intro-row {
  display: flex;
  flex-wrap: nowrap;
  padding: 0.5rem 0;
}

.ml-memory__intro {
  flex-basis: 83.3333%;
}

.ml-memory__play {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-basis: 16.6667%;
  min-width: 4.5em;
}

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
  font-size: var(--ak-fs-sm);

  &:hover {
    border-color: var(--ak-accent-muted);
    box-shadow: var(--ak-shadow-md);
  }

  @media (min-width: 1024px) {
    width: calc(50% - 0.5rem);
  }

  // 内容区窄：整体收 8% 左右；干员名用的是固定 rem 字号，按同一比例单独收
  &.ml-card--narrow {
    font-size: min(95%, var(--ak-fs-sm));

    .ml-memory__char {
      font-size: min(95%, var(--ak-fs-sm));
    }
  }
}

.ml-memory__divider {
  margin: 3px 0;
}
</style>
