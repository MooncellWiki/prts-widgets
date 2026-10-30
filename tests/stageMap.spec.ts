import { createApp, nextTick } from "vue";

import { afterEach, describe, expect, it, vi } from "vitest";

import { levelPath, scenePairsOf } from "@/widgets/StageMap/data";
import { EnemyIndex, prefabOf } from "@/widgets/StageMap/enemies";
import StageMap from "@/widgets/StageMap/index.vue";
import {
  Board,
  gridLabel,
  type ActionData,
  type CheckpointData,
  type LevelData,
  type MapData,
  type RouteData,
  type TileData,
} from "@/widgets/StageMap/level";
import { generateNextMap, PathGrid } from "@/widgets/StageMap/pathfinding";
import { RoutePlanner } from "@/widgets/StageMap/routes";
import { markOf, terrainOf, tileInfo } from "@/widgets/StageMap/tiles";
import {
  availableDifficulties,
  buildTimeline,
} from "@/widgets/StageMap/timeline";

import level0107 from "./fixtures/level_main_01-07.json";

// 地图从上往下写（同 mapData.map）：# 禁入 . 平地 , 不可放置 ^ 高台 S 起点 E 终点 O 地穴
const TILES: Record<string, TileData> = {
  "#": {
    tileKey: "tile_forbidden",
    heightType: "HIGHLAND",
    buildableType: "NONE",
    passableMask: "FLY_ONLY",
  },
  ".": {
    tileKey: "tile_road",
    heightType: "LOWLAND",
    buildableType: "MELEE",
    passableMask: "ALL",
  },
  ",": {
    tileKey: "tile_floor",
    heightType: "LOWLAND",
    buildableType: "NONE",
    passableMask: "ALL",
  },
  "^": {
    tileKey: "tile_wall",
    heightType: "HIGHLAND",
    buildableType: "RANGED",
    passableMask: "FLY_ONLY",
  },
  S: {
    tileKey: "tile_start",
    heightType: "LOWLAND",
    buildableType: "NONE",
    passableMask: "ALL",
  },
  E: {
    tileKey: "tile_end",
    heightType: "LOWLAND",
    buildableType: "NONE",
    passableMask: "ALL",
  },
  O: {
    tileKey: "tile_hole",
    heightType: "LOWLAND",
    buildableType: "NONE",
    passableMask: "ALL",
  },
};
const KEYS = Object.keys(TILES);

function mapData(
  rows: string[],
  blockEdges: MapData["blockEdges"] = null,
): MapData {
  return {
    map: rows.map((line) => [...line].map((ch) => KEYS.indexOf(ch))),
    tiles: KEYS.map((k) => TILES[k]),
    blockEdges,
  };
}
const gridOf = (rows: string[], edges?: MapData["blockEdges"]) =>
  new PathGrid(new Board(mapData(rows, edges)));

const route = (over: Partial<RouteData>): RouteData => ({
  motionMode: "WALK",
  startPosition: { row: 0, col: 0 },
  endPosition: { row: 0, col: 0 },
  checkpoints: null,
  allowDiagonalMove: true,
  ...over,
});
const cp = (
  type: CheckpointData["type"],
  row = 0,
  col = 0,
  time = 0,
): CheckpointData => ({
  type,
  time,
  position: { row, col },
  reachOffset: { x: 0, y: 0 },
});

describe("Board", () => {
  it("row 从下往上数，mapData.map 的第一行是最上面", () => {
    const board = new Board(mapData(["S.", "E#"]));
    expect(board.tile(0, 0)?.tileKey).toBe("tile_end");
    expect(board.tile(1, 0)?.tileKey).toBe("tile_start");
    expect(board.tile(0, 1)?.tileKey).toBe("tile_forbidden");
    expect(board.contains({ row: 2, col: 0 })).toBe(false);
  });

  it("坐标：行字母从 A 起、列从 1 起", () => {
    expect(gridLabel({ row: 0, col: 0 })).toBe("A1");
    expect(gridLabel({ row: 3, col: 10 })).toBe("D11");
    expect(gridLabel({ row: 26, col: 1 })).toBe("AA2");
  });
});

describe("tiles", () => {
  it("底色按高度 / 可放置 / 可通行分，不看 tileKey", () => {
    expect(terrainOf(TILES["^"])).toBe("high");
    expect(terrainOf(TILES["."])).toBe("ground");
    expect(terrainOf(TILES[","])).toBe("floor");
    expect(terrainOf(TILES["#"])).toBe("void");
    expect(
      terrainOf({
        tileKey: "tile_grass",
        heightType: "HIGHLAND",
        buildableType: "RANGED",
        passableMask: "FLY_ONLY",
      }),
    ).toBe("high");
    expect(
      terrainOf({
        tileKey: "tile_fence",
        heightType: "LOWLAND",
        buildableType: "MELEE",
        passableMask: "FLY_ONLY",
      }),
    ).toBe("fence");
  });

  it("基础地块没有标记，起点终点有专门的画法，其余功能地块画角标", () => {
    expect(markOf(TILES["."])).toBeNull();
    expect(markOf(TILES.S)).toBe("start");
    expect(markOf(TILES.O)).toBe("hole");
    expect(markOf({ ...TILES["."], tileKey: "tile_healing" })).toBe("special");
  });

  it("名称取游戏的地块说明，没有的按底色起名", () => {
    expect(tileInfo(TILES[","]).name).toBe("不可放置位");
    expect(tileInfo({ ...TILES["."], tileKey: "tile_grass" })).toEqual({
      name: "草丛",
      description: "置于其中的干员不会成为敌军远程攻击的目标",
    });
    expect(tileInfo({ ...TILES["^"], tileKey: "tile_unknown_x" }).name).toBe(
      "高台",
    );
  });
});

describe("寻路（SPFA + 拉直）", () => {
  const OPEN = ["...", "...", "..."];

  it("允许斜走：空地上拉直成一条斜线", () => {
    const map = generateNextMap(gridOf(OPEN), { row: 0, col: 0 }, "WALK", true);
    expect(map[2][2].next).toEqual({ row: 0, col: 0 });
    expect(map[2][2].distance).toBe(4);
  });

  it("不许斜走：只并同一行 / 同一列，行优先就地改写", () => {
    const map = generateNextMap(
      gridOf(OPEN),
      { row: 0, col: 0 },
      "WALK",
      false,
    );
    // SPFA 按 上 右 下 左 扩展，(2,2) 原本沿 (2,1)(2,0)(1,0) 走；(2,0) 先被拉直到 (0,0)
    expect(map[2][0].next).toEqual({ row: 0, col: 0 });
    expect(map[2][2].next).toEqual({ row: 2, col: 0 });
  });

  it("视线被挡就停在拐点前", () => {
    // 右上角到左下角的直线穿过中间的高台
    const map = generateNextMap(
      gridOf(["....", ".^..", "E..."]),
      { row: 0, col: 0 },
      "WALK",
      true,
    );
    expect(map[2][3].next).not.toEqual({ row: 0, col: 0 });
  });

  it("副轴只差一格时外接矩形要全空：拐角有障碍就不能斜着切", () => {
    const map = generateNextMap(
      gridOf(["..", "^."]),
      { row: 0, col: 1 },
      "WALK",
      true,
    );
    // (1,0) 到 (0,1) 的外接矩形里有高台 (0,0)
    expect(map[1][0].next).toEqual({ row: 1, col: 1 });
  });

  it("被挡的边：两边都走不过去，只挡指定的移动方式", () => {
    const edges = [
      {
        pos: { row: 0, col: 1 },
        direction: "LEFT" as const,
        blockMask: "WALK_ONLY" as const,
      },
    ];
    const walk = generateNextMap(
      gridOf(OPEN, edges),
      { row: 0, col: 0 },
      "WALK",
      true,
    );
    expect(walk[0][1].distance).toBe(3);
    const fly = generateNextMap(
      gridOf(["###", "###", "###"], edges),
      { row: 0, col: 0 },
      "FLY",
      true,
    );
    expect(fly[0][1].distance).toBe(1);
  });

  it("地穴代价极高：有别的路就绕开", () => {
    const map = generateNextMap(
      gridOf(["...", "EO."]),
      { row: 0, col: 0 },
      "WALK",
      true,
    );
    expect(map[0][2].distance).toBe(4);
  });

  it("目标格不能通行时整张表都无效", () => {
    const map = generateNextMap(
      gridOf(["^."]),
      { row: 0, col: 0 },
      "WALK",
      true,
    );
    expect(map[0][1].distance).toBe(-1);
  });
});

describe("路线", () => {
  const planner = (rows: string[]) => new RoutePlanner(gridOf(rows));

  it("空地上从起点直线走到终点", () => {
    const path = planner(["S..", "...", "..E"]).plan(
      route({
        startPosition: { row: 2, col: 0 },
        endPosition: { row: 0, col: 2 },
      }),
    )!;
    expect(path.legs).toHaveLength(1);
    expect(path.legs[0].points).toEqual([
      { x: 0, y: 2 },
      { x: 2, y: 0 },
    ]);
  });

  it("每进一个新格子就按所在格重新查表：拐角处斜着切过去", () => {
    // L 形走廊：从左上往下再往右
    const path = planner(["S##", ".##", "..E"]).plan(
      route({
        startPosition: { row: 2, col: 0 },
        endPosition: { row: 0, col: 2 },
      }),
    )!;
    const pts = path.legs[0].points;
    expect(pts[0]).toEqual({ x: 0, y: 2 });
    expect(pts.at(-1)).toEqual({ x: 2, y: 0 });
    // 沿途每一点都在能走的格子里
    for (const p of pts)
      expect([",", ".", "S", "E"]).toContain(
        ["S##", ".##", "..E"][2 - Math.round(p.y)][Math.round(p.x)],
      );
  });

  it("停留、隐身、出现：等待点记下来，隐身走的和直接放过去的分段", () => {
    const path = planner(["S....", ".....", "....E"]).plan(
      route({
        startPosition: { row: 2, col: 0 },
        endPosition: { row: 0, col: 4 },
        checkpoints: [
          cp("WAIT_FOR_SECONDS", 0, 0, 5),
          cp("DISAPPEAR"),
          cp("MOVE", 2, 2),
          cp("APPEAR_AT_POS", 0, 2),
        ],
      }),
    )!;
    expect(path.stops).toEqual([
      { at: { x: 0, y: 2 }, type: "WAIT_FOR_SECONDS", time: 5 },
    ]);
    expect(path.legs.map((l) => l.kind)).toEqual([
      "hidden",
      "teleport",
      "walk",
    ]);
    expect(path.legs[1].points).toEqual([
      { x: 2, y: 2 },
      { x: 2, y: 0 },
    ]);
  });

  it("巡逻：到最后一个巡逻点后回到第一个，不去终点", () => {
    const path = planner(["S...", "....", "...E"]).plan(
      route({
        startPosition: { row: 2, col: 0 },
        endPosition: { row: 0, col: 3 },
        checkpoints: [cp("PATROL_MOVE", 2, 3), cp("PATROL_MOVE", 0, 0)],
      }),
    )!;
    expect(path.patrol).toBe(true);
    expect(path.end).toEqual({ x: 3, y: 2 });
  });

  it("走不到的检查点画一段直线并标出来", () => {
    const path = planner(["S#.", "###", "..E"]).plan(
      route({
        startPosition: { row: 2, col: 0 },
        endPosition: { row: 0, col: 2 },
      }),
    )!;
    expect(path.legs.some((l) => l.unreachable)).toBe(true);
  });

  it("没有路线（E_NUM）不画", () => {
    expect(planner(["S"]).plan(route({ motionMode: "E_NUM" }))).toBeNull();
    expect(planner(["S"]).plan(null)).toBeNull();
  });
});

const action = (over: Partial<ActionData>): ActionData => ({
  actionType: "SPAWN",
  managedByScheduler: true,
  key: "enemy_a",
  count: 1,
  preDelay: 0,
  interval: 0,
  routeIndex: 0,
  blockFragment: false,
  isUnharmfulAndAlwaysCountAsKilled: false,
  hiddenGroup: null,
  randomSpawnGroupKey: null,
  randomSpawnGroupPackKey: null,
  weight: 0,
  dontBlockWave: false,
  ...over,
});
const levelWith = (over: Partial<LevelData>): LevelData => ({
  options: {
    characterLimit: 8,
    maxLifePoint: 3,
    initialCost: 10,
    maxCost: 99,
    costIncreaseTime: 1,
    moveMultiplier: 0.5,
  },
  mapData: mapData(["S"]),
  routes: [],
  enemyDbRefs: [],
  waves: [],
  branches: null,
  predefines: null,
  runes: null,
  ...over,
});
const times = (
  lv: LevelData,
  diff: Parameters<typeof buildTimeline>[1] = "NORMAL",
) => buildTimeline(lv, diff).groups.map((g) => g.time);

describe("出兵时间（出现即被击倒）", () => {
  it("1-7：与第三方出兵表、关卡页最短用时 1分58秒 一致", () => {
    const t = buildTimeline(level0107 as unknown as LevelData, "NORMAL");
    expect(t.groups.map((g) => g.time)).toEqual([
      6, 12, 18, 19, 32, 35, 50, 50, 53, 56, 65, 65, 71, 71, 75, 76, 86, 87, 94,
      94, 99, 107, 108, 116,
    ]);
    expect(t.enemyCount).toEqual({ min: 41, max: 41 });
    expect(t.duration).toBe(118);
  });

  it("阶段的 preDelay 只加在偏移上；阶段时长 = 最大偏移（含非出兵动作）", () => {
    const lv = levelWith({
      waves: [
        {
          preDelay: 1,
          postDelay: 2,
          maxTimeWaitingForNextWave: -1,
          fragments: [
            {
              preDelay: 3,
              actions: [
                action({ preDelay: 1 }),
                action({ actionType: "DIALOG", preDelay: 10 }),
              ],
            },
            { preDelay: 0, actions: [action({ count: 2, interval: 4 })] },
          ],
        },
        {
          preDelay: 5,
          postDelay: 0,
          maxTimeWaitingForNextWave: -1,
          fragments: [{ preDelay: 0, actions: [action({})] }],
        },
      ],
    });
    // 1 + (3+1) = 5；第一阶段到对话 1+3+10 = 14 结束；第二阶段 14、18；第二波 18 + 2 + 5 = 25
    expect(times(lv)).toEqual([5, 14, 25]);
    expect(buildTimeline(lv, "NORMAL").duration).toBe(25);
  });

  it("路线预览固定两下、间隔 0.3 秒；出兵前 3 秒的自动预览会把整个阶段往后推", () => {
    const lv = levelWith({
      waves: [
        {
          preDelay: 0,
          postDelay: 0,
          maxTimeWaitingForNextWave: -1,
          fragments: [
            {
              preDelay: 0,
              actions: [
                action({
                  actionType: "PREVIEW_CURSOR",
                  count: 4,
                  interval: 20,
                }),
              ],
            },
            {
              preDelay: 0,
              actions: [action({ preDelay: 1, autoPreviewRoute: true })],
            },
          ],
        },
      ],
    });
    // 第一阶段 0.3 秒；第二阶段最早一项在 1 - 3 = -2，往后推 2 秒
    expect(times(lv)).toEqual([0.3 + 3]);
  });

  it("隐藏组按难度启用，disable 优先；替换敌人只在对应难度", () => {
    const lv = levelWith({
      waves: [
        {
          preDelay: 0,
          postDelay: 0,
          maxTimeWaitingForNextWave: -1,
          fragments: [
            {
              preDelay: 0,
              actions: [
                action({ key: "enemy_a" }),
                action({ key: "enemy_b", hiddenGroup: "raid", preDelay: 1 }),
                action({ key: "enemy_c", hiddenGroup: "gone", preDelay: 2 }),
              ],
            },
          ],
        },
      ],
      runes: [
        {
          difficultyMask: "FOUR_STAR",
          key: "level_hidden_group_enable",
          blackboard: [{ key: "key", value: 0, valueStr: "raid" }],
        },
        {
          difficultyMask: "ALL",
          key: "level_hidden_group_enable",
          blackboard: [{ key: "key", value: 0, valueStr: "gone" }],
        },
        {
          difficultyMask: "ALL",
          key: "level_hidden_group_disable",
          blackboard: [{ key: "key", value: 0, valueStr: "gone" }],
        },
        {
          difficultyMask: "FOUR_STAR",
          key: "level_enemy_replace",
          blackboard: [
            { key: "key", value: 0, valueStr: "enemy_a" },
            { key: "value", value: 0, valueStr: "enemy_a_2" },
          ],
        },
      ],
    });
    expect(buildTimeline(lv, "NORMAL").groups.map((g) => g.key)).toEqual([
      "enemy_a",
    ]);
    expect(buildTimeline(lv, "FOUR_STAR").groups.map((g) => g.key)).toEqual([
      "enemy_a_2",
      "enemy_b",
    ]);
  });

  it("随机组按权重给概率，「这次不出」也占权重；总数给最少 / 最多", () => {
    const lv = levelWith({
      waves: [
        {
          preDelay: 0,
          postDelay: 0,
          maxTimeWaitingForNextWave: -1,
          fragments: [
            {
              preDelay: 0,
              actions: [
                action({
                  key: "enemy_a",
                  count: 2,
                  randomSpawnGroupKey: "g",
                  weight: 1,
                }),
                action({
                  key: "enemy_b",
                  count: 1,
                  randomSpawnGroupKey: "g",
                  weight: 2,
                }),
                action({
                  actionType: "EMPTY",
                  key: "",
                  randomSpawnGroupKey: "g",
                  weight: 1,
                }),
                action({ key: "enemy_c" }),
              ],
            },
          ],
        },
      ],
    });
    const t = buildTimeline(lv, "NORMAL");
    expect(t.groups.map((g) => g.chance)).toEqual([0.25, 0.5, null]);
    expect(t.enemyCount).toEqual({ min: 1, max: 3 });
  });

  it("不计数的敌人不进总数", () => {
    const lv = levelWith({
      waves: [
        {
          preDelay: 0,
          postDelay: 0,
          maxTimeWaitingForNextWave: -1,
          fragments: [
            {
              preDelay: 0,
              actions: [
                action({ key: "enemy_a", count: 3 }),
                action({ key: "enemy_x", count: 2 }),
              ],
            },
          ],
        },
      ],
    });
    expect(
      buildTimeline(lv, "NORMAL", { notCounted: (k) => k === "enemy_x" })
        .enemyCount,
    ).toEqual({ min: 3, max: 3 });
  });

  it("预设装置按 level_predefines_enable 改 hidden", () => {
    const inst = (alias: string, hidden: boolean) => ({
      position: { row: 0, col: 0 },
      direction: "UP" as const,
      hidden,
      alias,
      inst: { characterKey: "trap_x", level: 1, phase: "PHASE_0" },
    });
    const lv = levelWith({
      predefines: {
        characterInsts: [],
        tokenInsts: [inst("trap_x#1", true), inst("trap_x#2", true)],
      },
      runes: [
        {
          difficultyMask: "FOUR_STAR",
          key: "level_predefines_enable",
          blackboard: [{ key: "trap_x#2", value: 1, valueStr: null }],
        },
      ],
    });
    expect(buildTimeline(lv, "NORMAL").predefines.map((p) => p.hidden)).toEqual(
      [true, true],
    );
    expect(
      buildTimeline(lv, "FOUR_STAR").predefines.map((p) => p.hidden),
    ).toEqual([true, false]);
  });

  it("难度：easy_ / tough_ 单独一份文件；其余看符文里有没有突袭 / 险地", () => {
    const f = levelWith({
      runes: [
        {
          difficultyMask: "FOUR_STAR",
          key: "enemy_attribute_mul",
          blackboard: [],
        },
      ],
    });
    const s = levelWith({
      runes: [
        { difficultyMask: "SIX_STAR", key: "global_lifepoint", blackboard: [] },
      ],
    });
    expect(availableDifficulties(f, "main_01-07")).toEqual([
      "NORMAL",
      "FOUR_STAR",
    ]);
    expect(availableDifficulties(s, "main_15-04")).toEqual([
      "NORMAL",
      "SIX_STAR",
    ]);
    expect(availableDifficulties(f, "tough_14-15")).toEqual(["FOUR_STAR"]);
    expect(availableDifficulties(f, "easy_14-15")).toEqual(["EASY"]);
    expect(availableDifficulties(levelWith({}))).toEqual(["NORMAL"]);
  });
});

describe("出生动画与分支", () => {
  const wave = (actions: ActionData[], preDelay = 0) => ({
    preDelay: 0,
    postDelay: 0,
    maxTimeWaitingForNextWave: -1,
    fragments: [{ preDelay, actions }],
  });

  it("出兵提前 delayToBorn 秒，阶段跟着变短", () => {
    const lv = levelWith({
      waves: [
        wave([action({ key: "enemy_born", preDelay: 5 })]),
        wave([action({ key: "enemy_a", preDelay: 2 })]),
      ],
    });
    const bornDelay = (key: string) => (key === "enemy_born" ? 1.5 : 0);
    // 第一阶段 5 − 1.5 = 3.5；第二阶段接着 3.5 + 2
    expect(
      buildTimeline(lv, "NORMAL", { bornDelay }).groups.map((g) => g.time),
    ).toEqual([3.5, 5.5]);
    // 提前不早于阶段开始
    expect(
      buildTimeline(lv, "NORMAL", { bornDelay: () => 9 }).groups[0].time,
    ).toBe(0);
  });

  it("分支里的出兵单独列出：每段从被触发时算、走 extraRoutes、隐藏组照样管、不替换敌人", () => {
    const lv = levelWith({
      waves: [wave([action({ key: "enemy_a" })])],
      branches: {
        summon: {
          phases: [
            {
              preDelay: 1,
              actions: [action({ key: "enemy_a", preDelay: 2, routeIndex: 3 })],
            },
            {
              preDelay: 0,
              actions: [
                action({ key: "enemy_b" }),
                action({ key: "enemy_c", hiddenGroup: "off" }),
              ],
            },
          ],
        },
      },
      runes: [
        {
          difficultyMask: "ALL",
          key: "level_enemy_replace",
          blackboard: [
            { key: "key", value: 0, valueStr: "enemy_a" },
            { key: "value", value: 0, valueStr: "enemy_a_2" },
          ],
        },
      ],
    });
    const t = buildTimeline(lv, "NORMAL");
    expect(t.groups.map((g) => g.key)).toEqual(["enemy_a_2"]);
    expect(t.enemyCount).toEqual({ min: 1, max: 1 });
    expect(
      t.branchGroups.map((g) => [
        g.branch?.phase,
        g.time,
        g.key,
        g.routeIndex,
        g.extraRoute,
      ]),
    ).toEqual([
      [0, 3, "enemy_a", 3, true],
      [1, 0, "enemy_b", 0, true],
    ]);
  });
});

describe("转向", () => {
  const L = ["S##", ".##", "..E"];
  const plan = (steering?: {
    speed: number;
    factor: number;
    maxForce: number;
  }) =>
    new RoutePlanner(gridOf(L)).plan(
      route({
        startPosition: { row: 2, col: 0 },
        endPosition: { row: 0, col: 2 },
      }),
      steering,
    )!;

  it("逐帧积分：拐角是一段弧，最后停在终点附近", () => {
    const pts = plan({ speed: 0.5, factor: 8, maxForce: 10 }).legs[0].points;
    expect(pts.length).toBeGreaterThan(3);
    const end = pts.at(-1)!;
    expect(Math.hypot(end.x - 2, end.y)).toBeLessThanOrEqual(0.05);
    // 弧都在能走的格子里
    for (const p of pts)
      expect(L[2 - Math.round(p.y)][Math.round(p.x)]).not.toBe("#");
  });

  it("转得越慢冲得越远：进了下一格才拐，惯性带着更贴近拐角", () => {
    // 拐角附近离格子中心 (0,0) 的最近距离
    const corner = (factor: number) =>
      Math.min(
        ...plan({ speed: 1, factor, maxForce: 100 }).legs[0].points.map((p) =>
          Math.hypot(p.x, p.y),
        ),
      );
    expect(corner(2)).toBeLessThan(corner(20));
  });

  it("不知道敌人时按瞬间转向画折线", () => {
    expect(plan().legs[0].points).toHaveLength(3);
  });
});

describe("敌人数据", () => {
  it("预制体：快照里没有的按缺省值", () => {
    expect(prefabOf("enemy_10002_trtrsl").delayToBorn).toBe(1);
    expect(prefabOf("enemy_unknown")).toEqual({
      delayToBorn: 0,
      noDelayOnStartTile: false,
      steeringFactor: 8,
      maxSteeringForce: 10,
    });
  });

  it("按 level 取，没定义的退回 0 级；关卡的 overwrittenData 再盖一层", () => {
    const field = <T>(m_value: T, m_defined = true) => ({ m_defined, m_value });
    const index = new EnemyIndex({
      enemies: [
        {
          Key: "enemy_x",
          Value: [
            {
              level: 0,
              enemyData: {
                name: field("甲"),
                prefabKey: field("enemy_x"),
                levelType: field("ELITE" as const),
                motion: field("WALK" as const),
                notCountInTotal: field(false),
                attributes: { moveSpeed: field(1.1) },
              },
            },
            {
              level: 1,
              enemyData: {
                name: field("", false),
                prefabKey: field("", false),
                levelType: field("NORMAL" as const, false),
                motion: field("WALK" as const, false),
                notCountInTotal: field(false, false),
                attributes: { moveSpeed: field(0.5) },
              },
            },
          ],
        },
      ],
    });
    const info = index.resolve("enemy_x", {
      useDb: true,
      id: "enemy_x",
      level: 1,
      overwrittenData: { prefabKey: field("enemy_10002_trtrsl") },
    });
    expect(info).toMatchObject({ name: "甲", rank: "elite", moveSpeed: 0.5 });
    expect(info.prefab.delayToBorn).toBe(1);
  });

  it("关卡文件路径小写；levelScenePairs 指向实际读的那份", () => {
    expect(levelPath("Obt/Main/level_main_01-07")).toBe(
      "levels/obt/main/level_main_01-07.json",
    );
    expect(
      scenePairsOf({
        levelScenePairs: {
          "Obt/Main/level_easy_09-01": { levelId: "Obt/Main/level_main_09-01" },
        },
      }),
    ).toEqual({ "obt/main/level_easy_09-01": "Obt/Main/level_main_09-01" });
  });
});

describe("StageMap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  async function mount(props: Record<string, unknown>) {
    // 装置名称要去 torappu 取 character_table：测试里给一份
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ trap_002_emp: { name: "震撼装置" } })),
      ),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const app = createApp(StageMap, props);
    app.mount(host);
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    return { host, app };
  }

  it("1-7：画出地形、装置与选中那组的路线，点出兵表换路线", async () => {
    const enemyDb = Promise.resolve({
      enemies: [
        {
          Key: "enemy_1007_slime_2",
          Value: [
            {
              level: 0,
              enemyData: {
                name: { m_defined: true, m_value: "源石虫·α" },
                levelType: { m_defined: true, m_value: "NORMAL" },
                motion: { m_defined: true, m_value: "WALK" },
                notCountInTotal: { m_defined: false, m_value: false },
              },
            },
          ],
        },
      ],
    });
    const { host, app } = await mount({
      level: level0107,
      enemyDb,
      stageId: "main_01-07",
    });

    expect(host.querySelectorAll(".sm-tile")).toHaveLength(77);
    expect(host.querySelector(".sm-token")?.getAttribute("data-tip")).toBe(
      "D4 · 震撼装置",
    );
    expect(host.querySelectorAll(".sm-route--active")).toHaveLength(1);
    const rows = host.querySelectorAll<HTMLElement>(".sm-row");
    expect(rows).toHaveLength(24);
    expect(host.textContent).toContain("源石虫·α");

    rows[3].click();
    await nextTick();
    expect(rows[3].classList.contains("is-selected")).toBe(true);
    expect(host.querySelector(".sm-step__now")?.textContent).toContain(
      "4 / 24",
    );
    app.unmount();
  });

  it("关卡文件取不到时退回地图截图", async () => {
    const { host, app } = await mount({ level: null, stageId: "act53side_01" });
    expect(host.querySelector<HTMLImageElement>(".sm-preview")?.src).toBe(
      "https://torappu.prts.wiki/assets/map_preview/act53side_01.png",
    );
    app.unmount();
  });
});
