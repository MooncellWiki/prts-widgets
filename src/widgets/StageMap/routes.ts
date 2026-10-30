import {
  generateNextMap,
  isValid,
  type NextMap,
  type PathGrid,
} from "./pathfinding";

import type {
  CheckpointData,
  CheckpointType,
  GridPos,
  MotionMode,
  RouteData,
  Vec2,
} from "./level";

/**
 * 敌人沿路线怎么走，照 2.7.81 的 Torappu.Battle.BasicCursor 与各检查点（RVA 见各处注释）：
 * - 移动类检查点（MoveCheckpoint.GetNextDirection 0x8A0200）每一帧按敌人「当前所在格」查 next 表，朝 next 格中心走，
 *   next 就是目标格时朝目标点（格中心 + reachOffset）走——所以敌人每进一个新格子都会换方向，
 *   不是从出生格起沿 next 链走到底（Route.WalkAlongPath 是给预测用的那种走法）；
 * - 到达（MoveCheckpoint.CheckReached 0x89FDB0）：离目标点不超过 max(0.05, reachDistance)；所在格无效或在表里走不到时也算到达；
 * - DISAPPEAR 只是隐身，之后照样按检查点走；APPEAR_AT_POS 直接放到目标点并现身；等待类只停留；
 * - 巡逻（PatrolMoveCheckpoint.NextCursor 0x8A0FD0）：巡逻点之后是 MOVE 或路线尽头时，跳回这一串非 MOVE 检查点的开头，一直循环。
 * - 转向（MoveController.CalculateMoveDelta 0x8B6140 / _CalculateSteeringForce 0x8B71D0）：每个逻辑帧（30 帧 / 秒）
 *   速度 v 朝「方向 × 移速」靠拢：F = clamp((dir·speed − v)·steeringFactor, maxSteeringForce)，v = clamp(v + F·dt, speed)，
 *   所以拐弯是一段弧；steeringFactor / maxSteeringForce 是敌人预制体上的数值（见 enemies.ts），出生时 v = 0。
 *   不知道是哪种敌人时按瞬间转向画折线。nextTurn 只决定敌人朝哪边看（Enemy._CalculateFaceDirection），不影响走位。
 */

/** 一段连续的移动：hidden 是隐身时走的，teleport 是 APPEAR_AT_POS 直接放过去 */
export interface RouteLeg {
  kind: "walk" | "fly" | "hidden" | "teleport";
  /** 格坐标：x = col、y = row（格子中心是整数） */
  points: Vec2[];
  /** 静态地图上走不到（运行时地形会变的关卡）：这段只画直线 */
  unreachable?: boolean;
}

/** 在某处停下：WAIT_* 检查点 */
export interface RouteStop {
  at: Vec2;
  type: CheckpointType;
  time: number;
}

export interface RoutePath {
  motion: Exclude<MotionMode, "E_NUM">;
  legs: RouteLeg[];
  stops: RouteStop[];
  start: Vec2;
  /** 最后到的位置：一般是终点；巡逻的是回到巡逻起点 */
  end: Vec2;
  /** 巡逻：绕着几个巡逻点一直转，不去终点 */
  patrol: boolean;
}

/** GridPosition.FromVectorPosition 0x2103900：Math.Round，恰好 .5 时取偶数 */
function roundHalfEven(v: number) {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
const gridOf = (v: Vec2): GridPos => ({
  row: roundHalfEven(v.y),
  col: roundHalfEven(v.x),
});
const center = (p: GridPos): Vec2 => ({ x: p.col, y: p.row });
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const MOVE_TYPES = new Set<CheckpointType>([
  "MOVE",
  "PATROL_MOVE",
  "MAP_OFFSET_MOVE",
]);
const WAIT_TYPES = new Set<CheckpointType>([
  "WAIT_FOR_SECONDS",
  "WAIT_FOR_PLAY_TIME",
  "WAIT_CURRENT_FRAGMENT_TIME",
  "WAIT_CURRENT_WAVE_TIME",
  "WAIT_BOSSRUSH_WAVE",
]);
/** 巡逻循环的范围：CheckpointType 1–10，即 MOVE 以外的有效检查点 */
const loopable = (cp: CheckpointData | undefined) => !!cp && cp.type !== "MOVE";

/** 走一步最多跨出当前格多少：越过格边一点点，免得落在 .5 上 */
const NUDGE = 1e-4;

/**
 * 从 from 按 next 表走到目标点，返回途经的拐点（不含 from）；走不到返回 null。
 * 每次只走到「出当前格」或「到当前要去的点」，然后按新的位置重新查表
 */
function simulate(
  map: NextMap,
  from: Vec2,
  targetGrid: GridPos,
  targetPos: Vec2,
  reach: number,
): Vec2[] | null {
  const out: Vec2[] = [];
  let pos = from;
  let dir: Vec2 | null = null;
  const limit = 64 * map.length * (map[0]?.length ?? 1);
  for (let i = 0; i < limit; i++) {
    const g = gridOf(pos);
    const node = map[g.row]?.[g.col];
    if (!node || !isValid(node)) return null;
    if (dist(pos, targetPos) <= reach) {
      out.push(pos);
      return out;
    }
    const next = node.hasNext ? node.next : node.pos;
    const goal =
      next.row === targetGrid.row && next.col === targetGrid.col
        ? targetPos
        : center(next);
    const len = dist(pos, goal);
    if (len < 1e-9) return null; // 停在格子中心、却没有下一格：卡住了
    const d = { x: (goal.x - pos.x) / len, y: (goal.y - pos.y) / len };
    // 方向变了：上一段到此为止
    if (dir && Math.abs(d.x - dir.x) + Math.abs(d.y - dir.y) > 1e-6)
      out.push(pos);
    dir = d;
    // 沿 d 走出当前格（格子是 [c-0.5, c+0.5] × [r-0.5, r+0.5]）要多远
    const exit = Math.min(
      d.x > 0
        ? (g.col + 0.5 - pos.x) / d.x
        : d.x < 0
          ? (g.col - 0.5 - pos.x) / d.x
          : Infinity,
      d.y > 0
        ? (g.row + 0.5 - pos.y) / d.y
        : d.y < 0
          ? (g.row - 0.5 - pos.y) / d.y
          : Infinity,
    );
    const step = Math.min(len, Math.max(0, exit) + NUDGE);
    pos =
      step === len ? goal : { x: pos.x + d.x * step, y: pos.y + d.y * step };
  }
  return null;
}

/** 转向用的数值：速度（格 / 秒）= 敌人移速 × 关卡的 moveMultiplier（Entity.get_moveSpeed 0x707AA0） */
export interface Steering {
  speed: number;
  factor: number;
  maxForce: number;
}

/** 逻辑帧长：BattleConsts.TIME_ROUGH_LOGIC_RATE = 30 */
const TICK = 1 / 30;

const clampLength = (v: Vec2, max: number): Vec2 => {
  const len = Math.hypot(v.x, v.y);
  return len > max ? { x: (v.x / len) * max, y: (v.y / len) * max } : v;
};

/** 把逐帧的位置化简成折线：离弦不超过 eps 格的点去掉（Ramer–Douglas–Peucker） */
function simplify(points: Vec2[], eps = 0.004): Vec2[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const pa = points[a];
    const pb = points[b];
    const len = dist(pa, pb) || 1e-9;
    let far = -1;
    let max = eps;
    for (let i = a + 1; i < b; i++) {
      const p = points[i];
      const d =
        Math.abs((pb.x - pa.x) * (pa.y - p.y) - (pa.x - p.x) * (pb.y - pa.y)) /
        len;
      if (d > max) {
        max = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * 同 simulate，但按游戏的转向逐帧积分：返回途经的点（不含 from）与走完时的速度；走不到返回 null。
 * 绕着目标点打转、迟迟到不了的（转向很慢的敌人）超过帧数上限也返回 null，由调用方退回折线
 */
function simulateSteered(
  map: NextMap,
  from: Vec2,
  velocity: Vec2,
  targetGrid: GridPos,
  targetPos: Vec2,
  reach: number,
  { speed, factor, maxForce }: Steering,
): { points: Vec2[]; velocity: Vec2 } | null {
  const trail: Vec2[] = [from];
  let pos = from;
  let v = velocity;
  const limit =
    Math.ceil((4 * map.length * (map[0]?.length ?? 1)) / (speed * TICK)) + 600;
  for (let i = 0; i < limit; i++) {
    const g = gridOf(pos);
    const node = map[g.row]?.[g.col];
    if (!node || !isValid(node)) return null;
    if (dist(pos, targetPos) <= reach)
      return { points: simplify(trail).slice(1), velocity: v };
    const next = node.hasNext ? node.next : node.pos;
    const goal =
      next.row === targetGrid.row && next.col === targetGrid.col
        ? targetPos
        : center(next);
    const len = dist(pos, goal);
    if (len < 1e-9) return null;
    const force = clampLength(
      {
        x: (((goal.x - pos.x) / len) * speed - v.x) * factor,
        y: (((goal.y - pos.y) / len) * speed - v.y) * factor,
      },
      maxForce,
    );
    v = clampLength(
      { x: v.x + force.x * TICK, y: v.y + force.y * TICK },
      speed,
    );
    pos = { x: pos.x + v.x * TICK, y: pos.y + v.y * TICK };
    trail.push(pos);
  }
  return null;
}

/** 同一张地图上各条路线共用 next 表（同 SPFA 按 PathRequest 缓存） */
export class RoutePlanner {
  private readonly cache = new Map<string, NextMap>();
  constructor(private readonly grid: PathGrid) {}

  private nextMap(target: GridPos, mode: MotionMode, diagonal: boolean) {
    const key = `${target.row},${target.col},${mode},${diagonal}`;
    let map = this.cache.get(key);
    if (!map) {
      map = generateNextMap(this.grid, target, mode, diagonal);
      this.cache.set(key, map);
    }
    return map;
  }

  plan(
    route: RouteData | null | undefined,
    steering?: Steering,
  ): RoutePath | null {
    if (!route || route.motionMode === "E_NUM") return null;
    const motion = route.motionMode;
    const visible = motion === "FLY" ? "fly" : "walk";
    // Route.GetSpawnPosition / GetSpawnOffset：起点格中心 + spawnOffset（spawnRandomRange 的随机不画）
    const start: Vec2 = {
      x: route.startPosition.col + (route.spawnOffset?.x ?? 0),
      y: route.startPosition.row + (route.spawnOffset?.y ?? 0),
    };
    const legs: RouteLeg[] = [];
    const stops: RouteStop[] = [];
    let hidden = false;
    let leg: RouteLeg = { kind: visible, points: [start] };
    let pos = start;
    /** 出生时速度为 0（MoveController.Reset 0x8B6980） */
    let velocity: Vec2 = { x: 0, y: 0 };
    const kind = () => (hidden ? "hidden" : visible);
    const restart = (k: RouteLeg["kind"]) => {
      legs.push(leg);
      leg = { kind: k, points: [pos] };
    };

    const moveTo = (grid: GridPos, offset: Vec2, reachDistance = 0) => {
      const target = { x: grid.col + offset.x, y: grid.row + offset.y };
      const map = this.nextMap(grid, motion, route.allowDiagonalMove);
      const reach = Math.max(0.05, reachDistance);
      const steered =
        steering &&
        simulateSteered(map, pos, velocity, grid, target, reach, steering);
      if (steered) velocity = steered.velocity;
      const path = steered
        ? steered.points
        : simulate(map, pos, grid, target, reach);
      if (path) {
        leg.points.push(...path);
        pos = path.at(-1) ?? pos;
      } else {
        // 走不到：游戏里当作已到达、原地接着下一个检查点；这里画一段虚线指向目标
        restart(kind());
        leg.points.push(target);
        leg.unreachable = true;
        pos = target;
        restart(kind());
      }
    };

    const cps = route.checkpoints ?? [];
    let patrol = false;
    /** 巡逻跳回时要再走到的那个巡逻点（画出闭合的一圈就停） */
    let closeAt = -1;
    for (
      let i = 0, guard = 0;
      i < cps.length && guard < cps.length * 2 + 2;
      guard++
    ) {
      const cp = cps[i];
      if (MOVE_TYPES.has(cp.type)) {
        if (leg.kind !== kind()) restart(kind());
        moveTo(cp.position, cp.reachOffset ?? { x: 0, y: 0 }, cp.reachDistance);
        if (i === closeAt) break;
      } else if (WAIT_TYPES.has(cp.type)) {
        // 等待时方向为零，转向力把速度减到 0
        velocity = { x: 0, y: 0 };
        if (closeAt < 0) stops.push({ at: pos, type: cp.type, time: cp.time });
      } else if (cp.type === "DISAPPEAR") {
        hidden = true;
      } else if (cp.type === "APPEAR_AT_POS") {
        // AppearAtPosCheckpoint.OnBegin 0x88FF90：直接放到目标点并现身
        const dest = {
          x: cp.position.col + (cp.reachOffset?.x ?? 0),
          y: cp.position.row + (cp.reachOffset?.y ?? 0),
        };
        restart("teleport");
        leg.points.push(dest);
        pos = dest;
        hidden = false;
        restart(kind());
      }

      // MapOffsetMoveCheckpoint 继承自 PatrolMoveCheckpoint，同样会循环
      const patrolling =
        cp.type === "PATROL_MOVE" || cp.type === "MAP_OFFSET_MOVE";
      if (patrolling && !loopable(cps[i + 1]) && closeAt < 0) {
        let first = i;
        while (first > 0 && loopable(cps[first - 1])) first--;
        if (first !== i) {
          patrol = true;
          // 再走一圈到这一串里的第一个移动点，画出闭合的一段
          closeAt = cps.findIndex(
            (c, k) => k >= first && MOVE_TYPES.has(c.type),
          );
          i = first;
          continue;
        }
      }
      i++;
    }
    if (!patrol) {
      if (leg.kind !== kind()) restart(kind());
      moveTo(route.endPosition, { x: 0, y: 0 });
    }
    legs.push(leg);

    return {
      motion,
      legs: legs.filter((l) => l.points.length > 1),
      stops,
      start,
      end: pos,
      patrol,
    };
  }
}
