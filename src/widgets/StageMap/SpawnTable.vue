<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from "vue";

import { onImageError } from "@/utils/charImage";

import { enemyIcon, enemyLink } from "./enemies";
import { useStageMap } from "./store";

/**
 * 出兵表：一行一个出兵动作（同一种敌人、同一条路线连着出几只），按出现时间排，波次之间插一行分隔；
 * 由装置 / 关卡事件触发的分支接在后面，按分支、段分隔，时间写成「触发后 +N 秒」。
 * 点一行（或在地图下方逐组前后翻）选中它，地图上画出它的路线；选中行滚进可见区。
 * 时间按「出现即被击倒」算，跟关卡页的「最短用时」同一个口径。
 */
const store = useStageMap();
const { state, groups, timeline } = store;

const seconds = (t: number) => `${Math.round(t * 10) / 10}s`;

const scroller = useTemplateRef<HTMLElement>("scroller");
watch(
  () => state.selected,
  async (i) => {
    await nextTick();
    const row = scroller.value?.querySelector<HTMLElement>(
      `[data-index="${i}"]`,
    );
    const box = scroller.value;
    if (!row || !box) return;
    // 只在表格自己的滚动区里挪，不带着整页滚
    const top = row.offsetTop - (box.querySelector("thead")?.offsetHeight ?? 0);
    if (top < box.scrollTop) box.scrollTop = top;
    else if (
      row.offsetTop + row.offsetHeight >
      box.scrollTop + box.clientHeight
    )
      box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  },
);

/** 上一波的 maxTimeWaitingForNextWave：-1 = 等全部击倒，N = 最多等 N 秒 */
const waitNote = (maxWait: number) =>
  maxWait < 0 ? "（上一波全部击倒后）" : `（上一波击倒或 ${maxWait} 秒后）`;

/** 这一行前面要不要插分隔：换波（不止一波时）、进入分支、换一段分支 */
function sectionOf(i: number) {
  const g = groups.value[i];
  const prev = groups.value[i - 1];
  if (g.branch) {
    if (
      prev?.branch?.key === g.branch.key &&
      prev.branch.phase === g.branch.phase
    )
      return null;
    const phases = timeline.value.branchGroups.filter(
      (b) => b.branch?.key === g.branch!.key,
    );
    const many = new Set(phases.map((b) => b.branch!.phase)).size > 1;
    return {
      title: `触发出兵 · ${g.branch.key}${many ? ` 第 ${g.branch.phase + 1} 段` : ""}`,
      note: "由装置或关卡事件触发，时间从触发时算",
    };
  }
  if (timeline.value.waves.length < 2 || prev?.wave === g.wave) return null;
  return {
    title: `第 ${g.wave + 1} 波`,
    note: `${seconds(timeline.value.waves[g.wave].start)} 开始${
      g.wave > 0 ? waitNote(timeline.value.waves[g.wave - 1].maxWait) : ""
    }`,
  };
}
</script>

<template>
  <div ref="scroller" class="sm-spawns">
    <table class="ak-table ak-table--compact sm-table">
      <colgroup>
        <col style="width: 4.5em" />
        <col />
        <col style="width: 5em" />
        <col style="width: 4.5em" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" class="num">时间</th>
          <th scope="col">敌人</th>
          <th scope="col" class="num">数量</th>
          <th scope="col">路线</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(g, i) in groups" :key="i">
          <tr v-if="sectionOf(i)" class="sm-wave">
            <th scope="rowgroup" colspan="4">
              {{ sectionOf(i)!.title }}
              <span class="sm-sub">{{ sectionOf(i)!.note }}</span>
            </th>
          </tr>
          <tr
            :data-index="i"
            :class="['sm-row', { 'is-selected': state.selected === i }]"
            :aria-selected="state.selected === i"
            @click="store.select(i)"
            @mouseenter="state.hover = i"
            @mouseleave="state.hover = null"
          >
            <td class="num">
              {{ g.branch ? `+${seconds(g.time)}` : seconds(g.time) }}
            </td>
            <td>
              <span class="sm-enemy" :data-rank="store.enemyOf(g.key).rank">
                <img
                  class="sm-enemy__icon"
                  :src="enemyIcon(g.key)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  @error="onImageError"
                />
                <a
                  v-if="store.enemyOf(g.key).name"
                  class="sm-enemy__name"
                  :href="enemyLink(store.enemyOf(g.key).name)"
                  @click.stop
                >
                  {{ store.enemyOf(g.key).name }}
                </a>
                <span v-else class="sm-enemy__name sm-sub">{{ g.key }}</span>
                <span v-if="g.chance !== null" class="ak-tag ak-tag--sm">
                  随机{{
                    Number.isNaN(g.chance)
                      ? ""
                      : ` ${Math.round(g.chance * 100)}%`
                  }}
                </span>
                <span
                  v-if="store.enemyOf(g.key).notCountInTotal"
                  class="sm-sub"
                  data-tip="不计入关卡的敌人总数"
                >
                  不计数
                </span>
              </span>
            </td>
            <td class="num">
              ×{{ g.count }}
              <span v-if="g.count > 1" class="sm-sub sm-interval">
                每 {{ seconds(g.interval) }}
              </span>
            </td>
            <td>
              <button
                type="button"
                class="sm-route-btn"
                :aria-label="`选中第 ${i + 1} 组，看路线`"
                @click.stop="store.select(i)"
              >
                #{{ g.routeIndex }}
                <span
                  v-if="store.routeData(g)?.motionMode === 'FLY'"
                  class="sm-sub"
                >
                  飞行
                </span>
                <span
                  v-else-if="
                    !store.routeData(g) ||
                    store.routeData(g)?.motionMode === 'E_NUM'
                  "
                  class="sm-sub"
                >
                  无
                </span>
              </button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
// 表格自己滚：长的关卡上百组，不把地图挤出屏幕；表头吸顶
.sm-spawns {
  max-height: 420px;
  overflow: auto;
  border: 1px solid var(--ak-border);
  overscroll-behavior: contain;
}

.sm-table {
  border: 0;
  font-variant-numeric: tabular-nums;

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
  }
}

.sm-row {
  cursor: pointer;

  &.is-selected td:first-child {
    box-shadow: inset 3px 0 0 var(--ak-accent);
  }
}

.sm-wave th {
  background: var(--ak-bg-surface-2);
  font-weight: 700;
  font-size: var(--ak-fs-xs);
}

.sm-sub {
  font-weight: 400;
  font-size: var(--ak-fs-xs);
  color: var(--ak-fg-muted);
}

.sm-enemy {
  display: flex;
  align-items: center;
  gap: var(--ak-space-2);
  min-width: 0;

  // 地位：头像左边的色条，同敌人一览
  &[data-rank="elite"] .sm-enemy__icon {
    box-shadow: -3px 0 0 var(--ak-orange-500);
  }

  &[data-rank="boss"] .sm-enemy__icon {
    box-shadow: -3px 0 0 var(--ak-red-700);
  }
}

.sm-enemy__icon {
  flex: none;
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.sm-enemy__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

a.sm-enemy__name {
  color: var(--ak-link);

  &:hover {
    color: var(--ak-link-hover);
  }
}

.sm-interval {
  display: block;
  white-space: nowrap;
}

// 路线编号是数据里的下标，只用来看哪几组走同一条路：压淡
.sm-route-btn {
  all: unset;
  cursor: pointer;
  white-space: nowrap;
  color: var(--ak-fg-muted);

  &:focus-visible {
    outline: 2px solid var(--ak-focus);
    outline-offset: 2px;
  }
}
</style>
