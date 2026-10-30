import type { Board, Direction, GridPos, MotionMode } from "./level";

/**
 * 敌人寻路，逐行照 2.7.81 的 Torappu.Battle.SPFA / Route（RVA 见各函数注释）：
 * 1. SPFA._GenerateNextMapImpl：从目标格反向松弛，四邻接，地面单位每步代价是所在格的 moveCost、飞行单位恒为 1，
 *    得到每格的 next（往目标走的下一格）与 distance；
 * 2. SPFA._PostprocessAndMakeNextMapSmoothly：按行优先就地改写每格的 next，沿 next 链往前看，
 *    能「直线看见」（_RaycastBresenhamLine；不许斜走时 _RaycastSegmentLine）的就跳过去，于是路线成了几段直线；
 * 3. Route.ReconstructRoute：MOVE / PATROL_MOVE / MAP_OFFSET_MOVE 检查点各有一张 next 表，终点一张。
 * 敌人怎么沿着表走见 routes.ts。
 */

/** SharedConsts.Direction 的取值即下标：UP=0 RIGHT=1 DOWN=2 LEFT=3（MapUtil.GetFourWayDirection 0xAFFE00） */
const DIRECTIONS: Direction[] = ["UP", "RIGHT", "DOWN", "LEFT"];
/** GridPosition.GRID_FOUR_WAYS（GridPosition..cctor 0x2103C00），按 Direction 下标：UP 是 row + 1（row 从下往上数） */
const FOUR_WAYS: GridPos[] = [
  { row: 1, col: 0 },
  { row: 0, col: 1 },
  { row: -1, col: 0 },
  { row: 0, col: -1 },
];
/** MapUtil.InverseDirection 0xB00B30；SPFA 用的 SharedConsts.REVERSE_FOUR_WAYS = [DOWN, LEFT, UP, RIGHT] 也是它 */
const inverse = (d: number) => (d + 2) % 4;

/** Tile.get_isObstacleLike 0x8ADBB0：moveCost ≥ 1000 */
const OBSTACLE_COST = 1000;
/** HoleTile.get_moveCost 0x8ADDD0：地面单位能走但尽量绕开，也挡住拉直的视线 */
const HOLE_COST = 1_000_000;

export interface Node {
  pos: GridPos;
  /** 格子存在（Map.get_Item 非空） */
  exists: boolean;
  next: GridPos;
  hasNext: boolean;
  distance: number;
  inOpenList: boolean;
}

export type NextMap = Node[][];

const motionBit = (mode: MotionMode) => (mode === "FLY" ? 2 : 1);
const MASK_BITS = { NONE: 0, WALK_ONLY: 1, FLY_ONLY: 2, ALL: 3 } as const;

/** 静态地图上的格子：通行、四个方向能不能出去、移动代价 */
export class PathGrid {
  /** [row][col][mode] → 四个方向的位掩码（Map.GetGotoDirectionalPassableMask 0x87C5C0） */
  private readonly gotoMask: number[][][];
  constructor(readonly board: Board) {
    this.gotoMask = Array.from({ length: board.height }, (_, row) =>
      Array.from({ length: board.width }, (_, col) =>
        [0, 1].map((motion) => this.directionalMask({ row, col }, motion)),
      ),
    );
  }

  private directionalMask(pos: GridPos, motion: number) {
    let mask = 15;
    for (const edge of this.board.blockEdges) {
      if (!(MASK_BITS[edge.blockMask] & (1 << motion))) continue;
      const dir = DIRECTIONS.indexOf(edge.direction);
      if (edge.pos.row === pos.row && edge.pos.col === pos.col)
        mask &= ~(1 << dir);
      else if (
        edge.pos.row + FOUR_WAYS[dir].row === pos.row &&
        edge.pos.col + FOUR_WAYS[dir].col === pos.col
      )
        mask &= ~(1 << inverse(dir));
    }
    return mask;
  }

  /** Tile.IsPassable 0x8BFA60 */
  passable({ row, col }: GridPos, mode: MotionMode) {
    const tile = this.board.tile(row, col);
    return !!tile && (MASK_BITS[tile.passableMask] & motionBit(mode)) > 0;
  }

  /** Tile.IsPassableGoTo 0x8BF8F0：自己能通行，且这个方向的边没被挡 */
  passableGoTo(pos: GridPos, mode: MotionMode, dir: number) {
    return (
      this.passable(pos, mode) &&
      (this.gotoMask[pos.row][pos.col][mode === "FLY" ? 1 : 0] & (1 << dir)) > 0
    );
  }

  /** Tile.get_moveCost 0x8ADC40 为 1（放了障碍物时 1000，静态地图上没有）；地穴是 HoleTile */
  moveCost({ row, col }: GridPos) {
    return this.board.tile(row, col)?.tileKey === "tile_hole" ? HOLE_COST : 1;
  }
}

function emptyMap(board: Board): NextMap {
  return Array.from({ length: board.height }, (_, row) =>
    Array.from({ length: board.width }, (_, col) => ({
      pos: { row, col },
      exists: !!board.tile(row, col),
      next: { row, col },
      hasNext: false,
      distance: -1,
      inOpenList: false,
    })),
  );
}

/** Route.Node.get_isValid 0x8A0DB0 */
export const isValid = (n: Node) => n.distance >= 0 && n.exists;

/** SPFA._GenerateNextMapImpl 0x8A5860 */
function relax(grid: PathGrid, target: GridPos, mode: MotionMode): NextMap {
  const { board } = grid;
  const map = emptyMap(board);
  if (!board.contains(target) || !grid.passable(target, mode)) return map;

  const open: GridPos[] = [target];
  map[target.row][target.col].distance = 0;
  map[target.row][target.col].inOpenList = true;
  for (let head = 0; head < open.length; head++) {
    const cur = open[head];
    const curNode = map[cur.row][cur.col];
    curNode.inOpenList = false;
    for (let i = 0; i < 4; i++) {
      const pos = {
        row: cur.row + FOUR_WAYS[i].row,
        col: cur.col + FOUR_WAYS[i].col,
      };
      if (!board.contains(pos)) continue;
      // 邻格的单位往回走一步（朝 cur）是否可行
      if (!grid.passableGoTo(pos, mode, inverse(i))) continue;
      const cost = mode === "FLY" ? 1 : grid.moveCost(pos);
      const node = map[pos.row][pos.col];
      const distance = curNode.distance + cost;
      if (!isValid(node) || distance < node.distance) {
        node.next = cur;
        node.distance = distance;
        node.hasNext = true;
        if (!node.inOpenList) {
          node.inOpenList = true;
          open.push(pos);
        }
      }
    }
  }
  return map;
}

/** Route.Node.CheckObstacleLikeOrInvalid 0x8A08A0 */
function blocked(
  grid: PathGrid,
  map: NextMap,
  row: number,
  col: number,
  mode: MotionMode,
) {
  const node = map[row]?.[col];
  if (!node || node.distance < 0 || !node.exists) return true;
  return mode === "WALK" && grid.moveCost(node.pos) >= OBSTACLE_COST;
}

/** Route.Node.IsPassableGoTo 0x8A0CC0 / 0x8A0BF0（方向向量经 MapUtil.GetFourWayDirection 换成四向） */
function goTo(
  grid: PathGrid,
  map: NextMap,
  row: number,
  col: number,
  mode: MotionMode,
  dir: number,
) {
  const node = map[row]?.[col];
  return !!node?.exists && grid.passableGoTo(node.pos, mode, dir);
}
const UP = 0;
const RIGHT = 1;
const rowStepDir = (step: number) => (step > 0 ? UP : 2);
const colStepDir = (step: number) => (step > 0 ? RIGHT : 3);

/** SPFA._RaycastBresenhamLine 0x8A6290：a 到 b 的直线上没有障碍、沿途每一步的边都能过 */
function raycastBresenham(
  grid: PathGrid,
  map: NextMap,
  a: GridPos,
  b: GridPos,
  mode: MotionMode,
): boolean {
  const dy = Math.abs(a.row - b.row);
  const dx = Math.abs(a.col - b.col);
  const steep = dy > dx;
  // 以 x 为主轴迭代：不陡时 x = col、y = row；陡时反过来
  let [x0, y0, x1, y1] = steep
    ? [a.row, a.col, b.row, b.col]
    : [a.col, a.row, b.col, b.row];
  if (x0 > x1) [x0, y0, x1, y1] = [x1, y1, x0, y0];
  const ddx = x1 - x0;
  const ady = Math.abs(y1 - y0);
  const ystep = y0 < y1 ? 1 : -1;

  // 副轴只差 0 / 1 格：外接矩形里全都得空着（SPFA._CheckRectangeAllClear 0x8A5700，此处内联）
  if (ady <= 1) {
    for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++)
      for (
        let col = Math.min(a.col, b.col);
        col <= Math.max(a.col, b.col);
        col++
      )
        if (blocked(grid, map, row, col, mode)) return false;
  }

  // (x, y) → 格子：不陡时是 [y][x]，陡时是 [x][y]
  const at = (x: number, y: number): [number, number] =>
    steep ? [x, y] : [y, x];
  let err = -ddx;
  let y = y0;
  for (let x = x0; x <= x1; x++) {
    const [r, c] = at(x, y);
    if (blocked(grid, map, r, c, mode)) return false;
    // 主轴方向上前进一步：不陡时往右，陡时往上（迭代方向已经排成递增）
    if (!goTo(grid, map, r, c, mode, steep ? UP : RIGHT)) return false;
    err += 2 * ady;
    if (x < x1 && err >= 0) {
      // 斜着跨一格：拐角两格都不能是障碍，两条边也都要能过
      const [r1, c1] = at(x, y + ystep);
      const [r2, c2] = at(x + 1, y);
      if (blocked(grid, map, r1, c1, mode)) return false;
      if (blocked(grid, map, r2, c2, mode)) return false;
      const sideDir = steep ? colStepDir(ystep) : rowStepDir(ystep);
      if (!goTo(grid, map, r, c, mode, sideDir)) return false;
      if (!goTo(grid, map, r2, c2, mode, sideDir)) return false;
      if (!goTo(grid, map, r1, c1, mode, steep ? UP : RIGHT)) return false;
      y += ystep;
      err -= 2 * ddx;
    }
  }
  return true;
}

/** SPFA._RaycastSegmentLine 0x8A68F0：不许斜走时只并同一行 / 同一列 */
const raycastSegment = (a: GridPos, b: GridPos) =>
  a.row === b.row || a.col === b.col;

/** SPFA._PostprocessAndMakeNextMapSmoothly 0x8A5FE0：行优先、就地改写，后处理的格子会沿用前面已经拉直的 next */
function smooth(
  grid: PathGrid,
  map: NextMap,
  mode: MotionMode,
  allowDiagonal: boolean,
) {
  for (const line of map)
    for (const node of line) {
      if (!isValid(node) || !node.hasNext) continue;
      let target = node.next;
      while (map[target.row][target.col].hasNext) {
        const ahead = map[target.row][target.col].next;
        const visible = allowDiagonal
          ? raycastBresenham(grid, map, node.pos, ahead, mode)
          : raycastSegment(node.pos, ahead);
        if (!visible) break;
        target = ahead;
      }
      node.next = target;
    }
}

/** SPFA.GenerateNextMap 0x8A4EC0（不含缓存） */
export function generateNextMap(
  grid: PathGrid,
  target: GridPos,
  mode: MotionMode,
  allowDiagonal: boolean,
): NextMap {
  const map = relax(grid, target, mode);
  smooth(grid, map, mode, allowDiagonal);
  return map;
}
