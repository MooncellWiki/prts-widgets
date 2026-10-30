import {
  computed,
  inject,
  reactive,
  shallowRef,
  watch,
  type InjectionKey,
} from "vue";

import { fetchCharacterNames } from "./data";
import {
  EnemyIndex,
  prefabOf,
  type EnemyDatabase,
  type EnemyInfo,
} from "./enemies";
import { Board, type Difficulty, type LevelData } from "./level";
import { PathGrid } from "./pathfinding";
import { RoutePlanner, type RoutePath, type Steering } from "./routes";
import {
  availableDifficulties,
  buildTimeline,
  type SpawnGroup,
} from "./timeline";

import type { BoardRoute, BoardToken } from "./MapBoard.vue";
import type { ViewMode } from "./camera";

/** 同时画出的其它路线：选中那组出发前这么多秒内出发的（同 map.ark-nights.com 的默认值） */
export const TRAIL_SECONDS = 10;

export function createStageMap(
  level: LevelData,
  options: { stageId?: string; enemyDb?: Promise<EnemyDatabase> },
) {
  const board = new Board(level.mapData);
  const planner = new RoutePlanner(new PathGrid(board));
  const routeCache = new Map<string, RoutePath | null>();
  /** 一组出兵用的路线数据：波次里的取 routes，分支里的取 extraRoutes */
  const routeData = (g: SpawnGroup) =>
    (g.extraRoute ? level.extraRoutes : level.routes)?.[g.routeIndex] ?? null;

  const stageId = options.stageId ?? "";
  const difficulties = availableDifficulties(level, stageId);
  // 突袭的关卡 id 带 #f#，险地的带 #s
  const preferred: Difficulty | undefined = stageId.endsWith("#f#")
    ? "FOUR_STAR"
    : stageId.endsWith("#s")
      ? "SIX_STAR"
      : undefined;
  const state = reactive({
    difficulty:
      preferred && difficulties.includes(preferred)
        ? preferred
        : difficulties[0],
    /** 选中的出兵组（timeline.groups 的下标） */
    selected: 0,
    /** 鼠标停在出兵表哪一行上：先在地图上预览它的路线，不改选中 */
    hover: null as number | null,
    /** 画出全部路线，而不只是选中那组前后的 */
    showAll: false,
    /** 立体（同游戏镜头）/ 俯视 */
    view: "persp" as ViewMode,
  });

  const enemies = shallowRef<EnemyIndex | null>(null);
  const refs = new Map((level.enemyDbRefs ?? []).map((r) => [r.id, r]));
  const infoOf = (key: string) => enemies.value?.resolve(key, refs.get(key));
  const START_TILES = new Set(["tile_start", "tile_flystart"]);
  const timeline = computed(() =>
    buildTimeline(level, state.difficulty, {
      notCounted: (key) => infoOf(key)?.notCountInTotal ?? false,
      bornDelay(key, routeIndex, extraRoute) {
        const prefab = infoOf(key)?.prefab;
        if (!prefab) return 0;
        // 带 onlyDelayToBornOnTileStart 的：站在侵入点上出生时不提前。游戏里查的是对象池里那个实例当时所在的格子，
        // 这里按路线起点算
        const start = (extraRoute ? level.extraRoutes : level.routes)?.[
          routeIndex
        ]?.startPosition;
        const tile = start && board.tile(start.row, start.col);
        return prefab.noDelayOnStartTile &&
          tile &&
          START_TILES.has(tile.tileKey)
          ? 0
          : prefab.delayToBorn;
      },
    }),
  );
  /** 出兵表与逐组翻看的顺序：波次里的按时间排，分支里的接在后面 */
  const groups = computed(() => [
    ...timeline.value.groups,
    ...timeline.value.branchGroups,
  ]);
  const current = computed<SpawnGroup | undefined>(
    () => groups.value[state.selected],
  );

  function select(index: number) {
    const n = groups.value.length;
    if (n === 0) return;
    state.selected = Math.min(Math.max(index, 0), n - 1);
  }
  const step = (delta: number) => select(state.selected + delta);
  // 换难度后出兵组变了：从头看
  watch(
    () => state.difficulty,
    () => {
      state.selected = 0;
      state.hover = null;
    },
  );

  /** 这组敌人的转向数值；敌人数据还没回来时不知道，按瞬间转向画 */
  function steeringOf(g: SpawnGroup): Steering | undefined {
    const info = infoOf(g.key);
    if (!info) return undefined;
    return {
      speed: info.moveSpeed * (level.options.moveMultiplier ?? 1),
      // 关掉平滑转向时 _CalculateSteeringForce 用 100
      factor:
        level.options.steeringEnabled === false
          ? 100
          : info.prefab.steeringFactor,
      maxForce: info.prefab.maxSteeringForce,
    };
  }

  /** 这组敌人的走法：同一条路线、转向数值相同的共用一份 */
  function pathOf(g: SpawnGroup) {
    const steering = steeringOf(g);
    const key = [
      g.extraRoute ? "x" : "",
      g.routeIndex,
      steering?.speed,
      steering?.factor,
      steering?.maxForce,
    ].join(",");
    if (!routeCache.has(key))
      routeCache.set(key, planner.plan(routeData(g), steering));
    return routeCache.get(key) ?? null;
  }

  /** 地图上画哪些路线：选中（或悬停）那组 + 它出发前 TRAIL_SECONDS 秒内出发的（或者全部） */
  const boardRoutes = computed<BoardRoute[]>(() => {
    const cur = groups.value[state.hover ?? state.selected];
    const seen = new Set<RoutePath>();
    const out: BoardRoute[] = [];
    const add = (path: RoutePath | null, active: boolean) => {
      if (!path || seen.has(path)) return;
      seen.add(path);
      out.push({ path, state: active ? "active" : "dim" });
    };
    if (cur) add(pathOf(cur), true);
    for (const g of groups.value) {
      if (g === cur) continue;
      // 同时在场：波次里的按时间；分支里的只算同一段
      const near =
        cur &&
        (cur.branch
          ? g.branch?.key === cur.branch.key &&
            g.branch.phase === cur.branch.phase
          : !g.branch &&
            g.time <= cur.time + cur.interval * (cur.count - 1) &&
            g.time + g.interval * (g.count - 1) >= cur.time - TRAIL_SECONDS);
      if (state.showAll || near) add(pathOf(g), false);
    }
    return out;
  });

  const tokenNames = shallowRef<Record<string, string>>();
  const hasTokens =
    !!level.predefines?.tokenInsts?.length ||
    !!level.predefines?.characterInsts?.length;
  if (hasTokens && typeof window !== "undefined")
    fetchCharacterNames().then(
      (names) => (tokenNames.value = names),
      (error) => console.error("[StageMap] 装置名称读取失败", error),
    );

  /** 地图上的预设装置 / 单位（各难度都取 predefines，hidden 按难度改好，见 timeline.ts） */
  const tokens = computed<BoardToken[]>(() =>
    timeline.value.predefines.map((p) => ({
      pos: p.position,
      name: tokenNames.value?.[p.inst.characterKey] ?? p.inst.characterKey,
      hidden: p.hidden,
    })),
  );

  const enemiesFailed = shallowRef(false);
  options.enemyDb?.then(
    (db) => (enemies.value = new EnemyIndex(db)),
    (error) => {
      console.error("[StageMap] 敌人数据读取失败", error);
      enemiesFailed.value = true;
    },
  );
  function enemyOf(key: string): EnemyInfo {
    return (
      infoOf(key) ?? {
        id: key,
        name: "",
        rank: "normal",
        motion: "WALK",
        notCountInTotal: false,
        moveSpeed: 1,
        prefab: prefabOf(key),
      }
    );
  }

  return {
    board,
    difficulties,
    state,
    timeline,
    groups,
    current,
    select,
    step,
    pathOf,
    routeData,
    boardRoutes,
    tokens,
    enemiesFailed,
    enemyOf,
  };
}

export type StageMapStore = ReturnType<typeof createStageMap>;
export const stageMapKey: InjectionKey<StageMapStore> = Symbol("stage-map");
export const useStageMap = () => inject(stageMapKey)!;
