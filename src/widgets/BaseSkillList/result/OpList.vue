<script setup lang="ts">
import { AkElite } from "@mooncellwiki/prts-design-vue";

import { onImageError } from "@/utils/charImage";

import { eliteIcon, wikiLink } from "../assets";
import { condText } from "../consts";
import { stepPass } from "../filter";
import { highlight, renderRichText } from "../richText";
import { useBaseSkillList } from "../store";

import HolderCard from "./HolderCard.vue";
import RoomTag from "./RoomTag.vue";
import SkillTile from "./SkillTile.vue";

import type { Holding } from "../data";

/**
 * 结果 · 干员（现网没有：要看某位干员有哪些后勤技能得去干员页）。一张卡一位干员：头像（职业 / 星级在角上）· 名字，
 * 下面两个技能槽（游戏里就是两槽；只有一槽的不出空的「技能 2」），每槽按精英阶段依次替换的技能链一行一条——
 * 同干员页「后勤技能」那张表的信息，换成游戏进驻面板干员卡的摆法。被筛掉的技能压淡。
 */
const store = useBaseSkillList();
const { pageChars, query, source } = store;

const ok = (h: Holding) => stepPass(h, query.value);
</script>

<template>
  <div class="rs-ops" @error.capture="onImageError">
    <article v-for="c in pageChars" :key="c.id" class="rs-op">
      <div class="rs-op__head">
        <HolderCard :char="c" decorative />
        <h3 class="rs-op__name">
          <a
            :href="wikiLink(c.name)"
            v-html="highlight(c.name, query.needle)"
          />
        </h3>
      </div>
      <template v-for="(chain, si) in c.slots" :key="si">
        <div v-if="chain.length > 0" class="rs-slot">
          <p class="rs-slot__label">技能 {{ si + 1 }}</p>
          <div
            v-for="h in chain"
            :key="h.step"
            :class="['rs-step', { 'is-dim': !ok(h) }]"
          >
            <SkillTile :buff="h.buff" small />
            <div class="rs-step__head">
              <span
                class="rs-step__name"
                v-html="highlight(h.buff.name, query.needle)"
              />
              <AkElite
                :src="eliteIcon(h.phase)"
                :text="condText(h.phase, h.level)"
              />
              <RoomTag :room="h.buff.room" />
            </div>
            <p
              class="rs-step__desc"
              v-html="renderRichText(h.buff.desc, source.terms, query.needle)"
            />
          </div>
        </div>
      </template>
    </article>
  </div>
</template>

<style scoped lang="scss">
.rs-ops {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: var(--ak-space-3);

  .rs--narrow & {
    grid-template-columns: minmax(0, 1fr);
  }
}

.rs-op {
  display: flex;
  flex-direction: column;
  background: var(--ak-bg-surface);
  border: 1px solid var(--ak-border);

  &__head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px var(--ak-space-3);
    border-bottom: 1px solid var(--ak-border);
  }

  &__name {
    margin: 0;
    padding: 0;
    border: 0;
    font-family: inherit;
    font-size: var(--ak-fs-body);
    font-weight: 700;
    line-height: 1.3;

    a {
      color: inherit;
      text-decoration: none;

      &:hover {
        color: var(--ak-accent);
        text-decoration: underline;
      }
    }
  }
}

.rs-slot {
  padding: 8px var(--ak-space-3) 10px;

  & + & {
    border-top: 1px solid var(--ak-border);
  }

  &__label {
    margin: 0 0 6px;
    font: 700 var(--ak-fs-overline) / 1 var(--ak-font-display);
    letter-spacing: var(--ak-tracking-overline);
    text-transform: uppercase;
    color: var(--ak-fg-subtle);
  }
}

.rs-step {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 2px 10px;
  padding: 6px 0;

  & + & {
    border-top: 1px dashed var(--ak-border);
  }

  &.is-dim {
    opacity: 0.35;
  }

  &__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    min-height: 28px;

    .ak-elite {
      font-weight: 500;
      color: var(--ak-fg-muted);
    }
  }

  &__name {
    font-weight: 700;
    font-size: var(--ak-fs-sm);
  }

  &__desc {
    grid-column: 2;
    margin: 0;
    font-size: var(--ak-fs-xs);
    line-height: 1.6;
    color: var(--ak-fg-secondary);
    overflow-wrap: anywhere;

    :deep(.ak-rt-term:focus-visible) {
      outline: 2px solid var(--ak-focus);
      outline-offset: 1px;
    }
  }
}

.rs-op__name,
.rs-step__name,
.rs-step__desc {
  :deep(mark) {
    background: var(--ak-yellow-soft, rgba(255, 216, 0, 0.35));
    color: inherit;
    padding: 0 1px;
  }
}
</style>
