<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";

import { AkElite } from "@mooncellwiki/prts-design-vue";

import { onImageError } from "@/utils/charImage";

import { eliteIcon } from "../assets";
import { condText, MAX_HOLDERS } from "../consts";
import { holderPass } from "../filter";
import { hasMath, typesetMath } from "../math";
import { highlight, plainText, renderRichText } from "../richText";
import { useBaseSkillList } from "../store";

import HolderCard from "./HolderCard.vue";
import RoomTag from "./RoomTag.vue";
import SkillTile from "./SkillTile.vue";

import type { Buff, Holding } from "../data";

/**
 * 一行一条技能：方砖 ‖ 名字 · 解锁条件 · 设施 · 效率 / 替换关系 / 描述 / 备注 ‖ 持有干员。三列垂直居中。
 * 解锁条件：持有者都一样（763 条里 729 条）写在技能名旁边；不一样的（线索搜集·β 这类）持有干员按条件分段、段首写条件。
 * 持有干员超过 10 位先收起，点「+N」展开；持有者那三行筛选不符合的压淡、符合的排前面。
 */
const props = defineProps<{
  buff: Buff;
  /** 在设施分组里：不再带设施名 */
  grouped: boolean;
}>();

const store = useBaseSkillList();
const { query, holderFiltered, expanded, source } = store;

const needle = computed(() => query.value.needle);
const passes = (h: Holding) => holderPass(h, query.value);

const holders = computed(() => {
  const all = props.buff.holders;
  if (!holderFiltered.value) return all;
  return [...all].sort((x, y) => Number(passes(y)) - Number(passes(x)));
});
const dim = (h: Holding) => holderFiltered.value && !passes(h);

/** 出现过的解锁条件，按阶段 / 等级排 */
const conds = computed(() => {
  const map = new Map<string, Holding>();
  for (const h of props.buff.holders) if (!map.has(h.cond)) map.set(h.cond, h);
  return [...map.values()].sort(
    (a, b) => a.phase - b.phase || a.level - b.level,
  );
});
const open = computed(() => expanded.has(props.buff.index));
const visible = computed(() =>
  open.value ? holders.value : holders.value.slice(0, MAX_HOLDERS),
);

/** 替换关系：技能链的上一级 / 下一级；多位持有者各有各的下一级（线索搜集·α 后面接 8 种）就不逐个列了 */
const chain = computed(() => {
  const { prev, next } = props.buff;
  const out: { text: string; name?: string; after?: string }[] = [];
  if (prev.length > 2) out.push({ text: `由 ${prev.length} 种技能升级而来` });
  else
    for (const p of prev)
      out.push({ text: "由 ", name: p.name, after: " 升级而来" });
  if (next.length > 2)
    out.push({
      text: `${condText(next[0].phase, next[0].level)}替换为各自的下一级技能（${next.length} 种）`,
    });
  else
    for (const n of next)
      out.push({
        text: `${condText(n.phase, n.level)}替换为 `,
        name: n.buff.name,
      });
  return out;
});

const nameHtml = computed(() => highlight(props.buff.name, needle.value));
const descHtml = computed(() =>
  renderRichText(props.buff.desc, source.terms, needle.value),
);
const noteHtml = computed(() =>
  props.buff.note ? renderRichText(props.buff.note, source.terms) : "",
);

/* 备注里的公式：挂载后排一次（备注不跟搜索高亮，之后不会再变） */
const noteEl = useTemplateRef<HTMLElement>("note");
onMounted(() => {
  if (noteEl.value && props.buff.note && hasMath(plainText(props.buff.note)))
    typesetMath(noteEl.value);
});
</script>

<template>
  <article class="rs-item">
    <SkillTile :buff="buff" />
    <div class="rs-main">
      <div class="rs-head">
        <h3 class="rs-name" v-html="nameHtml" />
        <AkElite
          v-if="conds.length === 1"
          :src="eliteIcon(conds[0].phase)"
          :text="condText(conds[0].phase, conds[0].level)"
        />
        <RoomTag v-if="!grouped && !store.room" :room="buff.room" />
        <span
          v-if="buff.eff !== 0"
          class="rs-eff"
          tabindex="0"
          data-tip="游戏进驻面板按效率排序用的数值"
        >
          效率 {{ buff.eff }}
        </span>
      </div>
      <p v-if="chain.length > 0" class="rs-chain">
        <template v-for="(c, i) in chain" :key="i">
          <template v-if="i > 0">；</template>{{ c.text
          }}<b v-if="c.name">{{ c.name }}</b
          >{{ c.after }}
        </template>
      </p>
      <p class="rs-desc" v-html="descHtml" />
      <p v-if="noteHtml" ref="note" class="rs-note" v-html="noteHtml" />
    </div>
    <div class="rs-holders" @error.capture="onImageError">
      <template v-if="conds.length > 1">
        <div v-for="c in conds" :key="c.cond" class="rs-hgroup">
          <AkElite
            :src="eliteIcon(c.phase)"
            :text="condText(c.phase, c.level)"
          />
          <div class="rs-hgroup__list">
            <HolderCard
              v-for="h in holders.filter((x) => x.cond === c.cond)"
              :key="`${h.char.id}:${h.slot}`"
              :char="h.char"
              :holding="h"
              :dim="dim(h)"
            />
          </div>
        </div>
      </template>
      <template v-else>
        <HolderCard
          v-for="h in visible"
          :key="`${h.char.id}:${h.slot}`"
          :char="h.char"
          :holding="h"
          :dim="dim(h)"
        />
        <button
          v-if="holders.length > visible.length"
          type="button"
          class="rs-holders__more"
          :aria-label="`展开全部 ${holders.length} 位持有干员`"
          @click="store.expand(buff.index)"
        >
          +{{ holders.length - visible.length }}
        </button>
      </template>
    </div>
  </article>
</template>

<style scoped lang="scss">
// 三列垂直居中：一行描述的行比 64px 的干员卡矮，方砖和文字对着卡的中线；持有干员定宽一列（一行四张卡、多了折行）
.rs-item {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 268px;
  gap: 4px 14px;
  align-items: center;
  padding: 10px var(--ak-space-3);
  border-top: 1px solid var(--ak-border);

  // 分组里前面是组头（div），第一行不再画上框
  &:first-of-type {
    border-top: 0;
  }

  &:hover {
    background: var(--ak-bg-hover);
  }

  // 结果区窄于 860：持有干员移到描述下面一整行
  .rs--compact & {
    grid-template-columns: 36px minmax(0, 1fr);
  }
}

.rs-main {
  min-width: 0;
}

.rs-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;

  .ak-elite {
    font-weight: 500;
    color: var(--ak-fg-secondary);
  }
}

.rs-name {
  margin: 0;
  padding: 0;
  border: 0;
  font-family: inherit;
  font-size: var(--ak-fs-body);
  font-weight: 700;
  line-height: 1.3;
}

// 游戏按效率排序用的 efficiency（只有带效率排序的设施才有）
.rs-eff {
  font: 600 var(--ak-fs-xs) / 1 var(--ak-font-label);
  color: var(--ak-fg-muted);
  font-variant-numeric: tabular-nums;
  cursor: help;

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }
}

.rs-chain {
  margin: 2px 0 0;
  font-size: var(--ak-fs-xs);
  line-height: 1.5;
  color: var(--ak-fg-muted);

  b {
    font-weight: 600;
    color: var(--ak-fg-secondary);
  }
}

.rs-desc {
  margin: 4px 0 0;
  font-size: var(--ak-fs-sm);
  line-height: 1.65;
  color: var(--ak-fg);
  overflow-wrap: anywhere;
}

// 编辑写的备注（Template:BaseSkill/info，同现网表格里技能下面那一行）：比描述弱一级
.rs-note {
  margin: 4px 0 0;
  font-size: var(--ak-fs-xs);
  line-height: 1.6;
  color: var(--ak-fg-muted);
  overflow-wrap: anywhere;
}

.rs-name,
.rs-desc {
  :deep(mark) {
    background: var(--ak-yellow-soft, rgba(255, 216, 0, 0.35));
    color: inherit;
    padding: 0 1px;
  }
}

.rs-desc,
.rs-note {
  :deep(.ak-rt-term:focus-visible) {
    outline: 2px solid var(--ak-focus);
    outline-offset: 1px;
  }
}

.rs-holders {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 4px;
  min-width: 0;

  .rs--compact & {
    grid-column: 2;
    margin-top: 4px;
  }

  .rs--narrow & {
    grid-column: 1 / -1;
  }

  &__more {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    box-sizing: border-box;
    font: 600 var(--ak-fs-xs) / 1 var(--ak-font-label);
    color: var(--ak-fg-muted);
    background: var(--ak-bg-surface-2);
    border: 1px dashed var(--ak-border-strong);
    cursor: pointer;

    &:hover {
      color: var(--ak-fg);
      border-color: var(--ak-fg-muted);
    }

    &:focus-visible {
      outline: 2px solid var(--ak-focus);
      outline-offset: 2px;
    }

    .rs--compact & {
      width: 56px;
      height: 56px;
    }
  }
}

// 持有者条件不一样的：按条件分段，段首写条件
.rs-hgroup {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 100%;
  min-width: 0;

  & + & {
    margin-top: 4px;
  }

  .ak-elite {
    font-weight: 500;
    color: var(--ak-fg-muted);
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
}
</style>
