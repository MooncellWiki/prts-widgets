import type {
  ActionData,
  Difficulty,
  FragmentData,
  LevelData,
  PredefinedInst,
  RuneData,
} from "./level";

/**
 * 出兵时间表，照 2.7.81 的 Torappu.Battle.Scheduler（RVA 见各处注释），按「出现即被击倒」算——
 * 跟关卡页「最短用时」同一个口径（一倍速下所有敌人出场即被歼灭的理论用时）：
 * - 波（_DealWave 0x951ED0）：等 preDelay → 各阶段依次执行 → 等本波敌人清空（这里为 0）→ 等 postDelay；
 * - 阶段（_DealFragment 0x951A70）：各动作展开成若干项、按偏移排进同一个队列（_DealAction 0x919FB0），
 *   偏移都从阶段开始量，fragment.preDelay 只加在每项的偏移上、本身不单独等；
 *   队列逐项执行（ExecuteActionQueue 0x94E650），阶段时长 = 最大偏移，下一阶段不等敌人被击倒；
 *   偏移为负（自动路线预览在出兵前 3 秒）时整个阶段往后推；
 * - 出兵的偏移先减去敌人预制体的出生动画时长 delayToBorn（_CreateEnemyItem），敌人在原定时刻播完出生动画；
 * - 非出兵动作只占偏移、不占时间（剧情 / 对话要等玩家看完的那段不算）。
 * 分支（branches）由装置 / 关卡脚本在战斗中触发（波次不会启动它们），每段的时间从触发那一刻算，见 branchGroups。
 */

/** 一个出兵动作（SPAWN）：同一种敌人、同一条路线，按间隔出 count 只 */
export interface SpawnGroup {
  /** 第几波（从 0 数）；分支里的是 -1 */
  wave: number;
  /** 首只出现的时间（秒）；分支里的从这一段被触发时算 */
  time: number;
  /** 敌人 id（已按 level_enemy_replace 替换） */
  key: string;
  count: number;
  interval: number;
  routeIndex: number;
  /** 路线取 extraRoutes（分支里的出兵都是：_DealAction 把 useExtraRoute 改写成「是不是分支」） */
  extraRoute: boolean;
  /** 随机出兵：同一阶段里同组几个按权重抽一个，这是抽中的概率；只随包（pack）走的是 NaN */
  chance: number | null;
  /** 分支：哪一个分支的第几段 */
  branch: { key: string; phase: number } | null;
}

export interface WaveInfo {
  /** 本波开始的时间（秒） */
  start: number;
  /**
   * 进入下一波前等本波敌人：-1 = 等到全部被击倒，N = 最多等 N 秒（maxTimeWaitingForNextWave）。
   * 按「出现即被击倒」算时都不用等
   */
  maxWait: number;
}

export interface Timeline {
  groups: SpawnGroup[];
  /** 分支里的出兵：按分支、段排，时间从各段被触发时算 */
  branchGroups: SpawnGroup[];
  waves: WaveInfo[];
  /** 关卡内的预设装置（hidden 已按 level_predefines_enable 改好） */
  predefines: PredefinedInst[];
  /** 计入总数的敌人只数（游戏左上角的 0 / N）；有随机出兵时是最少 / 最多 */
  enemyCount: { min: number; max: number };
  /** 最后一只出现的时间（秒）= 关卡页的「最短用时」 */
  duration: number;
}

export interface TimelineOptions {
  /** 敌人数据里的 notCountInTotal（数据还没回来时都算） */
  notCounted?: (key: string) => boolean;
  /** 出兵提前多少秒：敌人预制体的 delayToBorn（数据还没回来时按 0） */
  bornDelay?: (key: string, routeIndex: number, extraRoute: boolean) => number;
}

const DIFFICULTY_BITS: Record<RuneData["difficultyMask"], number> = {
  NONE: 0,
  NORMAL: 1,
  FOUR_STAR: 2,
  EASY: 4,
  SIX_STAR: 8,
  ALL: 15,
};

/** LegacyInLevelRuneData.CheckValidForDifficulty 0x251D2F0：(difficulty & mask) == difficulty */
const runeApplies = (rune: RuneData, difficulty: Difficulty) => {
  const bit = DIFFICULTY_BITS[difficulty];
  return (bit & DIFFICULTY_BITS[rune.difficultyMask]) === bit;
};

/**
 * 这份关卡文件用在哪几个难度上。一份文件至多两个：普通 + 突袭（#f#）或常规 + 险地（#s）；
 * easy_ / tough_ 开头的关卡单独一份文件（BattleInOut.InParams.GetFinalDifficulty 0x5E0F50：
 * diffGroup EASY → EASY，TOUGH → FOUR_STAR）。没有关卡 id 时看符文里出现过的难度
 */
export function availableDifficulties(
  level: LevelData,
  stageId = "",
): Difficulty[] {
  if (stageId.startsWith("easy_")) return ["EASY"];
  if (stageId.startsWith("tough_")) return ["FOUR_STAR"];
  const masks = new Set(level.runes?.map((r) => r.difficultyMask));
  const out: Difficulty[] = ["NORMAL"];
  if (masks.has("FOUR_STAR")) out.push("FOUR_STAR");
  if (masks.has("SIX_STAR")) out.push("SIX_STAR");
  return out;
}

const bbStrings = (rune: RuneData, key: string) =>
  (rune.blackboard ?? [])
    .filter((p) => p.key === key && p.valueStr)
    .map((p) => p.valueStr!);

interface Item {
  t: number;
  action: ActionData;
  /** SPAWN 的第几只 */
  index: number;
}

/**
 * Scheduler._DealAction 0x919FB0：一个动作展开成队列里的若干项（偏移相对阶段开始）。
 * STORY 及以后的类型只占一个偏移，count / interval 不起作用；PREVIEW_CURSOR 固定两项、间隔 0.3 秒
 */
function expand(
  fragment: FragmentData,
  action: ActionData,
  bornDelay: number,
): Item[] {
  const t0 = fragment.preDelay + action.preDelay;
  if (action.actionType === "PREVIEW_CURSOR")
    return [0, 1].map((i) => ({ t: t0 + i * 0.3, action, index: i }));
  if (action.actionType !== "SPAWN") return [{ t: t0, action, index: 0 }];
  // 出兵的偏移减去预制体的出生动画时长后不小于 0
  const spawnAt = Math.max(0, t0 - bornDelay);
  const items = Array.from({ length: action.count }, (_, i) => ({
    t: spawnAt + i * action.interval,
    action,
    index: i,
  }));
  // 出兵前 3 秒自动预览路线：两项光标，间隔 0.3 秒；偏移是负的时整个阶段往后推（见 buildTimeline）
  if (action.autoPreviewRoute)
    items.push(
      {
        t: spawnAt - 3,
        action: { ...action, actionType: "PREVIEW_CURSOR" },
        index: 0,
      },
      {
        t: spawnAt - 2.7,
        action: { ...action, actionType: "PREVIEW_CURSOR" },
        index: 1,
      },
    );
  return items;
}

/**
 * 随机出兵（RandomGroupSchedulerPreprocessor.DoPreprocess 0x94A310，肉鸽 / 保全 / 生息演算等玩法）：
 * 同一阶段内同一 randomSpawnGroupKey 的几个动作按 weight 抽一个，抽中空 key 就是这次不出；
 * 带 randomSpawnGroupPackKey 的随同包的抽签结果一起出或一起不出。普通关卡的玩法不做这一步，它们的数据里这两个字段也都是空的
 */
function randomChances(actions: ActionData[]) {
  const totals = new Map<string, number>();
  for (const a of actions)
    if (a.randomSpawnGroupKey)
      totals.set(
        a.randomSpawnGroupKey,
        (totals.get(a.randomSpawnGroupKey) ?? 0) + Math.max(0, a.weight),
      );
  return (a: ActionData): number | null => {
    if (a.randomSpawnGroupKey) {
      const total = totals.get(a.randomSpawnGroupKey) ?? 0;
      return total > 0 ? Math.max(0, a.weight) / total : 0;
    }
    return a.randomSpawnGroupPackKey ? Number.NaN : null;
  };
}

/** 一个阶段里最少 / 最多出几只：随机组按选项里计数的最小 / 最大值算，只随包走的最少算 0 */
function countRange(
  actions: ActionData[],
  counted: (a: ActionData) => number,
): { min: number; max: number } {
  let min = 0;
  let max = 0;
  const groups = new Map<string, number[]>();
  for (const a of actions) {
    if (a.randomSpawnGroupKey) {
      const list = groups.get(a.randomSpawnGroupKey) ?? [];
      list.push(counted(a));
      groups.set(a.randomSpawnGroupKey, list);
    } else if (a.randomSpawnGroupPackKey) {
      max += counted(a);
    } else {
      min += counted(a);
      max += counted(a);
    }
  }
  for (const list of groups.values()) {
    min += Math.min(...list);
    max += Math.max(...list);
  }
  return { min, max };
}

export function buildTimeline(
  level: LevelData,
  difficulty: Difficulty,
  { notCounted = () => false, bornDelay = () => 0 }: TimelineOptions = {},
): Timeline {
  const runes = (level.runes ?? []).filter((r) => runeApplies(r, difficulty));
  const byKey = (key: string) => runes.filter((r) => r.key === key);

  // Scheduler.Init 0x9135C0：启用的隐藏组 = enable 的 − disable 的
  const enabled = new Set(
    byKey("level_hidden_group_enable").flatMap((r) => bbStrings(r, "key")),
  );
  for (const r of byKey("level_hidden_group_disable"))
    for (const k of bbStrings(r, "key")) enabled.delete(k);
  /** Scheduler.CheckActionEnabled 0x912B50 */
  const isEnabled = (a: ActionData) =>
    a.hiddenGroup === null || enabled.has(a.hiddenGroup);

  // LEnemyKeyReplace.PreprocessLevelData 0xCFB030：只改波次里的 SPAWN / DISPLAY_ENEMY_INFO，分支不改
  const replace = new Map<string, string>();
  for (const r of byKey("level_enemy_replace")) {
    const [from] = bbStrings(r, "key");
    const [to] = bbStrings(r, "value");
    if (from && to) replace.set(from, to);
  }

  // LPredefinesInstEnable.PreprocessLevelData 0xD001E0：别名（没有别名时用 characterKey）在黑板里的，hidden = (值 == 0)
  const predefineSwitch = new Map<string, boolean>();
  for (const r of byKey("level_predefines_enable"))
    for (const p of r.blackboard ?? [])
      predefineSwitch.set(p.key, p.value === 0);
  const predefines = [
    ...(level.predefines?.characterInsts ?? []),
    ...(level.predefines?.tokenInsts ?? []),
  ].map((inst) => {
    const hidden = predefineSwitch.get(inst.alias ?? inst.inst.characterKey);
    return hidden === undefined ? inst : { ...inst, hidden };
  });

  const enemyCount = { min: 0, max: 0 };

  /**
   * 排一个阶段（分支的一段也是这样排）：返回各组出兵（时间从 clock 起算）与阶段时长
   */
  function schedule(
    fragment: FragmentData,
    clock: number,
    where: Pick<SpawnGroup, "wave" | "extraRoute" | "branch">,
  ) {
    const enabledActions = fragment.actions
      .filter(isEnabled)
      .map((a) =>
        !where.extraRoute &&
        (a.actionType === "SPAWN" || a.actionType === "DISPLAY_ENEMY_INFO") &&
        replace.has(a.key)
          ? { ...a, key: replace.get(a.key)! }
          : a,
      );
    // 抽签时「这次不出」也占权重
    const chance = randomChances(enabledActions);
    // 空 key 的出兵、EMPTY 都是随机组里「这次不出」的那一项（只出现在肉鸽关卡），随机预处理最后会删掉
    const actions = enabledActions.filter(
      (a) => a.actionType !== "EMPTY" && (a.key || a.actionType !== "SPAWN"),
    );
    const items = actions.flatMap((a) =>
      expand(
        fragment,
        a,
        a.actionType === "SPAWN"
          ? bornDelay(a.key, a.routeIndex, where.extraRoute)
          : 0,
      ),
    );
    const groups: SpawnGroup[] = [];
    if (items.length === 0) return { groups, length: 0, enabledActions };
    const shift = Math.max(0, -Math.min(...items.map((i) => i.t)));
    for (const item of items) {
      const { action } = item;
      if (action.actionType !== "SPAWN" || item.index !== 0) continue;
      groups.push({
        ...where,
        time: clock + item.t + shift,
        key: action.key,
        count: action.count,
        interval: action.interval,
        routeIndex: action.routeIndex,
        chance: chance(action),
      });
    }
    return {
      groups,
      length: Math.max(...items.map((i) => i.t)) + shift,
      enabledActions,
    };
  }

  const groups: SpawnGroup[] = [];
  const waves: WaveInfo[] = [];
  let clock = 0;
  (level.waves ?? []).forEach((wave, w) => {
    clock += wave.preDelay;
    waves.push({ start: clock, maxWait: wave.maxTimeWaitingForNextWave });
    for (const fragment of wave.fragments) {
      const done = schedule(fragment, clock, {
        wave: w,
        extraRoute: false,
        branch: null,
      });
      // Scheduler.Init：总数 = 波次里启用的 SPAWN 的 count 之和，去掉 notCountInTotal 的；随机组按每组最少 / 最多算
      const range = countRange(
        done.enabledActions.filter(
          (a) => a.actionType === "SPAWN" || a.actionType === "EMPTY",
        ),
        (a) =>
          a.actionType !== "SPAWN" ||
          !a.key ||
          a.notCountInTotal ||
          notCounted(a.key)
            ? 0
            : a.count,
      );
      enemyCount.min += range.min;
      enemyCount.max += range.max;
      groups.push(...done.groups);
      clock += done.length;
    }
    clock += wave.postDelay;
  });
  // 同一时刻的按动作在数据里的先后（排序是稳定的）
  groups.sort((a, b) => a.time - b.time);
  const duration = Math.max(
    0,
    ...groups.map((g) => g.time + g.interval * (g.count - 1)),
  );

  // Scheduler._DealBranchPhase 0x951450：每段像阶段一样排，时间从被触发时算
  const branchGroups: SpawnGroup[] = [];
  for (const [key, branch] of Object.entries(level.branches ?? {}))
    branch.phases.forEach((phase, i) => {
      const done = schedule(phase, 0, {
        wave: -1,
        extraRoute: true,
        branch: { key, phase: i },
      });
      branchGroups.push(...done.groups.sort((a, b) => a.time - b.time));
    });

  return { groups, branchGroups, waves, predefines, enemyCount, duration };
}
