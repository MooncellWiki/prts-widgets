<script setup lang="ts">
import { computed, useId } from "vue";

import {
  bounds,
  createCamera,
  HIGHLAND_HEIGHT,
  polygon,
  type ScreenPoint,
  type ViewMode,
} from "./camera";
import { gridLabel, type Board, type GridPos, type Vec2 } from "./level";
import { markOf, terrainOf, tileInfo, type TileMark } from "./tiles";

import type { RoutePath } from "./routes";

/**
 * 地图：格子 + 敌人路线 + 预设装置，按 camera.ts 的投影画成 SVG，随容器宽度缩放。
 * 立体：同游戏战斗镜头的斜俯视，高台是凸起的方块（看得见朝镜头的侧面），起点 / 终点是红 / 蓝线框立方体（同游戏）；
 * 俯视：正交的示意图，高台靠深浅和底边的阴影区分。
 * 底色按高度深浅（越高越接近前景色），其余功能地块画右上角的黄色角标；
 * 每格的 data-tip 是「坐标 · 名称 · 说明」，提示气泡由外层的 useHoverTip 接。
 */
export interface BoardRoute {
  path: RoutePath;
  /** active：当前选中的那组；dim：同时在场的其它路线 */
  state: "active" | "dim";
}

export interface BoardToken {
  pos: GridPos;
  name: string;
  /** 默认不出场（hidden 预设，由出兵动作激活） */
  hidden: boolean;
}

const props = defineProps<{
  board: Board;
  routes: BoardRoute[];
  tokens: BoardToken[];
  mode: ViewMode;
}>();

/** 格子之间留的缝（格） */
const GAP = 0.04;
/** 起点 / 终点线框立方体的高（格） */
const CUBE = 0.9;
/** 立体时路线离地多高（格）：地面的浮起一点、飞行的悬在高台之上，地上各画一道影子 */
const WALK_LIFT = 0.15;
const FLY_HEIGHT = 0.8;

const camera = computed(() =>
  createCamera(props.mode, props.board.width, props.board.height),
);
const P = (x: number, y: number, z = 0) => camera.value.project(x, y, z);
const persp = computed(() => props.mode === "persp");

function heightAt(row: number, col: number) {
  const tile = props.board.tile(row, col);
  return tile && terrainOf(tile) === "high" ? HIGHLAND_HEIGHT : 0;
}

/** 世界坐标里的四边形（逆时针）投影成 polygon 的 points */
const quad = (pts: [number, number, number][]) =>
  polygon(pts.map(([x, y, z]) => P(x, y, z)));

interface Face {
  points: string;
  kind: "front" | "side";
}

interface Cell {
  key: string;
  terrain: string;
  mark: TileMark | null;
  tip: string;
  top: string;
  faces: Face[];
  /** 俯视时高台底边的阴影 */
  ledge: string | null;
  /** 地块上的小标记（地穴 / 通道 / 角标）的轮廓 */
  inset: string;
  corner: string;
  center: ScreenPoint;
  /** 起点 / 终点 / 空袭点的线框立方体：12 条棱 */
  cube: string | null;
  depth: number;
}

const cells = computed(() => {
  const { board } = props;
  const camX = board.width / 2;
  const out: Cell[] = [];
  for (let row = 0; row < board.height; row++)
    for (let col = 0; col < board.width; col++) {
      const tile = board.tile(row, col);
      if (!tile) continue;
      const terrain = terrainOf(tile);
      if (terrain === "none") continue;
      const mark = markOf(tile);
      const h = heightAt(row, col);
      const x0 = col + GAP;
      const x1 = col + 1 - GAP;
      const y0 = row + GAP;
      const y1 = row + 1 - GAP;
      const faces: Face[] = [];
      if (persp.value && h > 0) {
        // 朝镜头的正面：前一行（row − 1）比自己低时露出来
        const below = heightAt(row - 1, col);
        if (below < h)
          faces.push({
            kind: "front",
            points: quad([
              [x0, y0, below],
              [x1, y0, below],
              [x1, y0, h],
              [x0, y0, h],
            ]),
          });
        // 侧面：镜头在左边看得见左侧面，在右边看得见右侧面
        if (camX < x0 && heightAt(row, col - 1) < h)
          faces.push({
            kind: "side",
            points: quad([
              [x0, y0, heightAt(row, col - 1)],
              [x0, y1, heightAt(row, col - 1)],
              [x0, y1, h],
              [x0, y0, h],
            ]),
          });
        if (camX > x1 && heightAt(row, col + 1) < h)
          faces.push({
            kind: "side",
            points: quad([
              [x1, y0, heightAt(row, col + 1)],
              [x1, y1, heightAt(row, col + 1)],
              [x1, y1, h],
              [x1, y0, h],
            ]),
          });
      }
      const inset = (d: number) =>
        quad([
          [col + d, row + d, h],
          [col + 1 - d, row + d, h],
          [col + 1 - d, row + 1 - d, h],
          [col + d, row + 1 - d, h],
        ]);
      let cube: string | null = null;
      if (mark === "start" || mark === "end" || mark === "flystart") {
        const c0 = col + 0.08;
        const c1 = col + 0.92;
        const r0 = row + 0.08;
        const r1 = row + 0.92;
        const ring = (z: number) =>
          [
            P(c0, r0, z),
            P(c1, r0, z),
            P(c1, r1, z),
            P(c0, r1, z),
          ] as ScreenPoint[];
        const lo = ring(0);
        const hi = ring(persp.value ? CUBE : 0);
        const loop = (pts: ScreenPoint[]) =>
          `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L")}Z`;
        cube = persp.value
          ? loop(lo) +
            loop(hi) +
            lo
              .map(
                (p, i) =>
                  `M${p.x.toFixed(1)},${p.y.toFixed(1)}L${hi[i].x.toFixed(1)},${hi[i].y.toFixed(1)}`,
              )
              .join("")
          : loop(lo);
      }
      const { name, description } = tileInfo(tile);
      const center = P(col + 0.5, row + 0.5, h);
      out.push({
        key: `${row}-${col}`,
        terrain,
        mark,
        tip: [`${gridLabel({ row, col })} · ${name}`, description]
          .filter(Boolean)
          .join("\n"),
        top: inset(GAP),
        faces,
        ledge:
          !persp.value && h > 0
            ? quad([
                [x0, y0, h],
                [x1, y0, h],
                [x1, y0 + 0.12, h],
                [x0, y0 + 0.12, h],
              ])
            : null,
        inset: inset(mark === "hole" ? 0.25 : 0.22),
        corner: quad([
          [x1 - 0.3, y1, h],
          [x1, y1, h],
          [x1, y1 - 0.3, h],
        ]),
        center,
        cube,
        // 远的先画：先按离镜头的远近，同一行里离中线远的先画（它的侧面会被近中线的那格挡住）
        depth: P(col + 0.5, row + 0.5).depth * 100 + Math.abs(col + 0.5 - camX),
      });
    }
  return out.sort((a, b) => b.depth - a.depth);
});

const rows = computed(() =>
  Array.from({ length: props.board.height }, (_, row) => ({
    label: gridLabel({ row, col: 0 }).replace(/\d+$/, ""),
    at: P(-0.62, row + 0.5),
  })),
);
const cols = computed(() =>
  Array.from({ length: props.board.width }, (_, col) => ({
    label: String(col + 1),
    at: P(col + 0.5, -0.42),
  })),
);

const viewBox = computed(() => {
  const { width, height } = props.board;
  const pts = [
    P(-0.8, -0.8),
    P(width, -0.8),
    P(-0.8, height),
    P(width, height),
    P(-0.8, height, CUBE),
    P(width, height, CUBE),
  ];
  const b = bounds(pts, 6);
  return `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.width.toFixed(1)} ${b.height.toFixed(1)}`;
});

/**
 * 路线上的点（格中心是整数）投影到屏幕：踩着高台走的（玉门天灾工事）抬到台面；
 * 立体时地面的浮起 WALK_LIFT、飞行的悬在 FLY_HEIGHT，shadow 取落在地上的影子
 */
function routePoint(p: Vec2, fly: boolean, shadow = false) {
  const ground = heightAt(Math.round(p.y), Math.round(p.x));
  const z =
    !persp.value || shadow
      ? ground + 0.01
      : fly
        ? FLY_HEIGHT
        : ground + WALK_LIFT;
  return P(p.x + 0.5, p.y + 0.5, z);
}
const points = (pts: Vec2[], fly: boolean, shadow = false) =>
  polygon(pts.map((p) => routePoint(p, fly, shadow)));

/** 先画暗的，再画选中的，选中的压在上面 */
const ordered = computed(() =>
  [...props.routes].sort(
    (a, b) => Number(a.state === "active") - Number(b.state === "active"),
  ),
);

const tokenMarks = computed(() =>
  props.tokens.map((t) => {
    const { row, col } = t.pos;
    const h = heightAt(row, col);
    return {
      ...t,
      outline: polygon(
        [
          [col + 0.22, row + 0.22],
          [col + 0.78, row + 0.22],
          [col + 0.78, row + 0.78],
          [col + 0.22, row + 0.78],
        ].map(([x, y]) => P(x, y, h)),
      ),
      center: P(col + 0.5, row + 0.5, h),
    };
  }),
);

const STOP_LABEL: Record<string, string> = {
  WAIT_FOR_SECONDS: "停留",
  WAIT_FOR_PLAY_TIME: "等到战斗开始后",
  WAIT_CURRENT_FRAGMENT_TIME: "等到本阶段开始后",
  WAIT_CURRENT_WAVE_TIME: "等到本波开始后",
  WAIT_BOSSRUSH_WAVE: "等到下一波",
};
/** 停留秒数取一位小数（数据里有 42.450001 这种） */
const secs = (t: number) => Math.round(t * 10) / 10;
const stopTip = (type: string, time: number) =>
  `${STOP_LABEL[type] ?? type} ${secs(time)} 秒`;
/** 停留标签：底框按文字宽度定（Bender 11px 的数字约 6.5 单位宽） */
const stopLabel = (time: number) => {
  const text = `${secs(time)}s`;
  return { text, width: 10 + text.length * 6.5 };
};

const id = useId();
const arrow = (state: string) => `url(#${id}-arrow-${state})`;
</script>

<template>
  <svg
    :class="['sm-board', `sm-board--${mode}`]"
    :viewBox="viewBox"
    role="img"
    :aria-label="`地图 ${board.width} × ${board.height}`"
  >
    <defs>
      <marker
        v-for="state in ['active', 'dim']"
        :id="`${id}-arrow-${state}`"
        :key="state"
        :class="`sm-arrow sm-arrow--${state}`"
        viewBox="0 0 10 10"
        refX="7"
        refY="5"
        markerWidth="4"
        markerHeight="4"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 Z" />
      </marker>
    </defs>

    <g class="sm-axis" aria-hidden="true">
      <text
        v-for="r in rows"
        :key="r.label"
        :x="r.at.x"
        :y="r.at.y"
        dominant-baseline="central"
        text-anchor="middle"
      >
        {{ r.label }}
      </text>
      <text
        v-for="c in cols"
        :key="c.label"
        :x="c.at.x"
        :y="c.at.y"
        dominant-baseline="central"
        text-anchor="middle"
      >
        {{ c.label }}
      </text>
    </g>

    <g class="sm-tiles">
      <g
        v-for="c in cells"
        :key="c.key"
        :class="[
          'sm-tile',
          `sm-tile--${c.terrain}`,
          c.mark && `sm-mark--${c.mark}`,
        ]"
        :data-tip="c.tip"
      >
        <polygon
          v-for="(f, i) in c.faces"
          :key="i"
          :class="`sm-tile__${f.kind}`"
          :points="f.points"
        />
        <polygon class="sm-tile__face" :points="c.top" />
        <polygon v-if="c.ledge" class="sm-tile__ledge" :points="c.ledge" />
        <polygon
          v-if="c.mark === 'hole'"
          class="sm-tile__pit"
          :points="c.inset"
        />
        <template v-else-if="c.mark === 'telin' || c.mark === 'telout'">
          <polygon class="sm-tile__portal" :points="c.inset" />
          <text
            class="sm-tile__glyph"
            :x="c.center.x"
            :y="c.center.y"
            dominant-baseline="central"
            text-anchor="middle"
          >
            {{ c.mark === "telin" ? "入" : "出" }}
          </text>
        </template>
        <polygon
          v-else-if="c.mark === 'special'"
          class="sm-tile__corner"
          :points="c.corner"
        />
        <path v-if="c.cube" class="sm-tile__cube" :d="c.cube" />
      </g>
    </g>

    <g class="sm-tokens">
      <g
        v-for="(t, i) in tokenMarks"
        :key="i"
        :class="['sm-token', { 'is-hidden': t.hidden }]"
        :data-tip="`${gridLabel(t.pos)} · ${t.name}${t.hidden ? '（之后出现）' : ''}`"
      >
        <polygon :points="t.outline" />
        <text
          :x="t.center.x"
          :y="t.center.y"
          dominant-baseline="central"
          text-anchor="middle"
        >
          {{ t.name.slice(0, 1) }}
        </text>
      </g>
    </g>

    <g class="sm-routes" aria-hidden="true">
      <g
        v-for="(r, i) in ordered"
        :key="i"
        :class="[
          'sm-route',
          `sm-route--${r.state}`,
          `sm-route--${r.path.motion.toLowerCase()}`,
        ]"
      >
        <template v-for="(leg, j) in r.path.legs" :key="j">
          <polyline
            v-if="persp && leg.kind !== 'teleport'"
            class="sm-route__shadow"
            :points="points(leg.points, r.path.motion === 'FLY', true)"
          />
          <polyline
            :class="[
              'sm-route__line',
              `sm-route__line--${leg.kind}`,
              { 'is-unreachable': leg.unreachable },
            ]"
            :points="points(leg.points, r.path.motion === 'FLY')"
            :marker-end="
              j === r.path.legs.length - 1 ? arrow(r.state) : undefined
            "
          />
          <polyline
            v-if="
              r.state === 'active' &&
              (leg.kind === 'walk' || leg.kind === 'fly')
            "
            class="sm-route__flow"
            :points="points(leg.points, r.path.motion === 'FLY')"
          />
        </template>
        <rect
          class="sm-route__start"
          :x="routePoint(r.path.start, r.path.motion === 'FLY').x - 4"
          :y="routePoint(r.path.start, r.path.motion === 'FLY').y - 4"
          width="8"
          height="8"
        />
      </g>
    </g>

    <!-- 停留点放最上面，提示要能悬停到 -->
    <g class="sm-stops">
      <template v-for="(r, i) in ordered" :key="i">
        <g
          v-for="(s, j) in r.state === 'active' ? r.path.stops : []"
          :key="j"
          class="sm-stop"
          :data-tip="stopTip(s.type, s.time)"
        >
          <rect
            :x="
              routePoint(s.at, r.path.motion === 'FLY').x -
              stopLabel(s.time).width / 2
            "
            :y="routePoint(s.at, r.path.motion === 'FLY').y - 9"
            :width="stopLabel(s.time).width"
            height="18"
          />
          <text
            :x="routePoint(s.at, r.path.motion === 'FLY').x"
            :y="routePoint(s.at, r.path.motion === 'FLY').y"
            dominant-baseline="central"
            text-anchor="middle"
          >
            {{ stopLabel(s.time).text }}
          </text>
        </g>
      </template>
    </g>
  </svg>
</template>

<style scoped lang="scss">
// 颜色变量（--sm-*）定义在根节点上，图例的色块共用
.sm-board {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
}

.sm-axis text {
  font-family: var(--ak-font-label);
  font-weight: 700;
  font-size: 13px;
  fill: var(--ak-fg-muted);
}

.sm-tile__face {
  fill: var(--sm-floor);
}

.sm-tile--void .sm-tile__face {
  fill: var(--sm-void);
}

.sm-tile--ground .sm-tile__face {
  fill: var(--sm-ground);
}

.sm-tile--high .sm-tile__face {
  fill: var(--sm-high);
}

// 高台的侧面：比台面暗，正面最暗（同游戏里朝镜头那面背光）
.sm-tile__front {
  fill: var(--sm-high-front);
}

.sm-tile__side {
  fill: var(--sm-high-side);
}

.sm-tile__ledge {
  fill: var(--sm-high-front);
}

// 围栏：地面上一圈粗框，不能走
.sm-tile--fence .sm-tile__face {
  fill: var(--sm-ground);
  stroke: var(--sm-high-front);
  stroke-width: 3;
  stroke-linejoin: round;
}

.sm-mark--start .sm-tile__face,
.sm-mark--flystart .sm-tile__face {
  fill: color-mix(in srgb, var(--sm-start) 22%, var(--sm-floor));
}

.sm-mark--end .sm-tile__face {
  fill: color-mix(in srgb, var(--sm-end) 22%, var(--sm-floor));
}

// 起点 / 终点：同游戏的线框立方体
.sm-tile__cube {
  fill: none;
  stroke-width: 2.5;
  stroke-linejoin: round;

  .sm-mark--start &,
  .sm-mark--flystart & {
    stroke: var(--sm-start);
  }

  .sm-mark--flystart & {
    stroke-dasharray: 6 4;
  }

  .sm-mark--end & {
    stroke: var(--sm-end);
  }
}

// 地穴：两套主题里都是黑洞
.sm-tile__pit {
  fill: var(--sm-pit);
}

.sm-tile__portal {
  fill: none;
  stroke: var(--sm-start);
  stroke-width: 2;

  .sm-mark--telout & {
    stroke: var(--sm-end);
  }
}

.sm-tile__glyph {
  font-size: 13px;
  font-weight: 700;
  fill: var(--ak-fg);
}

// 功能地块：右上角黄色角标（设计系统的角标三角），名字和说明在提示里
.sm-tile__corner {
  fill: var(--ak-yellow-500);
}

.sm-tile:hover .sm-tile__face {
  stroke: var(--ak-fg);
  stroke-width: 2;
}

.sm-token {
  polygon {
    fill: var(--ak-bg-surface);
    stroke: var(--ak-yellow-600);
    stroke-width: 2;
  }

  text {
    font-size: 13px;
    font-weight: 700;
    fill: var(--ak-fg);
  }

  &.is-hidden polygon {
    stroke-dasharray: 3 3;
  }
}

// 立体时路线在地上的影子：同游戏里单位脚下的阴影，看得出路线离地多高
.sm-route__shadow {
  fill: none;
  stroke: #000;
  stroke-opacity: 0.45;
  stroke-width: 3;
  stroke-linejoin: round;
  stroke-linecap: round;

  .sm-route--dim & {
    stroke-width: 2;
    stroke-opacity: 0.25;
  }
}

.sm-route__line {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.sm-route--dim .sm-route__line {
  stroke: var(--sm-route-dim);
  stroke-width: 2;
  opacity: 0.6;
}

.sm-route--active .sm-route__line {
  stroke: var(--sm-route);
  stroke-width: 4;
}

// 飞行路线虚线
.sm-route__line--fly {
  stroke-dasharray: 8 6;
}

// 隐身时走的：点线；直接放过去的：更稀的点线、细一点
.sm-route__line--hidden {
  stroke-dasharray: 1 6;
}

.sm-route .sm-route__line--teleport {
  stroke-dasharray: 1 9;
  stroke-width: 2;
}

.sm-route__line.is-unreachable {
  stroke-dasharray: 2 6;
}

// 选中的路线上一串小段朝终点流动，表示方向
.sm-route__flow {
  fill: none;
  stroke: var(--ak-bg-canvas);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 2 14;
  animation: sm-flow 0.8s linear infinite;
}

@keyframes sm-flow {
  to {
    stroke-dashoffset: -16;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sm-route__flow {
    animation: none;
  }
}

.sm-arrow path {
  fill: var(--sm-route-dim);
}

.sm-arrow--active path {
  fill: var(--sm-route);
}

.sm-route__start {
  .sm-route--active & {
    fill: var(--sm-route);
  }

  .sm-route--dim & {
    fill: var(--sm-route-dim);
  }
}

.sm-stop {
  rect {
    fill: var(--ak-bg-inverse);
  }

  text {
    font-family: var(--ak-font-label);
    font-weight: 700;
    font-size: 11px;
    fill: var(--ak-fg-inverse);
  }
}
</style>
