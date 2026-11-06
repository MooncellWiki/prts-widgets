import { condText, professionName, PROFESSIONS } from "./consts";

import type { Buff, Char, Holding, Room, Source } from "./data";

export type FilterId = "room" | "target" | "phase" | "rarity" | "prof";

export interface FilterOption {
  /** 也是地址栏里的写法 */
  id: string;
  label: string;
  /** 设施行、作用对象行：选项属于哪个设施 */
  room?: Room;
  /** 解锁阶段行：精英图标 */
  phase?: number;
}

export interface FilterDef {
  id: FilterId;
  title: string;
  /** 看的是持有干员（技能只要有一位持有者符合就留下），不是技能本身 */
  holder: boolean;
  options: FilterOption[];
}

/** 固定定义只读；每个实例自己的选择 */
export interface FilterState {
  readonly id: FilterId;
  readonly def: FilterDef;
  selected: Set<string>;
}

export type Filters = Record<FilterId, FilterState>;

export const FILTER_IDS: FilterId[] = [
  "room",
  "target",
  "phase",
  "rarity",
  "prof",
];
const HOLDER_IDS: FilterId[] = ["phase", "rarity", "prof"];

/**
 * 五行筛选，行内「或」、行间「且」（同干员一览）：
 *   设施 / 作用对象看技能本身——作用对象 = 游戏进驻面板按效率排序时的分组（buffSortData），只约束自己那个设施的技能；
 *   解锁阶段 / 干员稀有度 / 干员职业看持有干员——技能只要有一位持有者符合就留下，不符合的持有者在结果里压淡。
 */
export function createFilters(source: Source): Filters {
  const defs: FilterDef[] = [
    {
      id: "room",
      title: "设施",
      holder: false,
      options: source.rooms.map((room) => ({
        id: room.id,
        label: room.name,
        room,
      })),
    },
    {
      id: "target",
      title: "作用对象",
      holder: false,
      options: source.rooms.flatMap((room) =>
        room.targets.map((t) => ({ id: t.id, label: t.label, room })),
      ),
    },
    {
      id: "phase",
      title: "解锁阶段",
      holder: true,
      options: source.conds.map((c) => ({
        id: c.id,
        label: condText(c.phase, c.level),
        phase: c.phase,
      })),
    },
    {
      id: "rarity",
      title: "干员稀有度",
      holder: true,
      options: [6, 5, 4, 3, 2, 1].map((n) => ({
        id: String(n),
        label: String(n),
      })),
    },
    {
      id: "prof",
      title: "干员职业",
      holder: true,
      options: PROFESSIONS.map((p) => ({ id: p, label: professionName(p) })),
    },
  ];
  return Object.fromEntries(
    defs.map((def) => [def.id, { id: def.id, def, selected: new Set() }]),
  ) as Filters;
}

/** 这一行有没有这个选项：地址栏和点选都只收认得的 id */
export const hasOption = (f: FilterState, id: string) =>
  f.def.options.some((option) => option.id === id);

/** 已选的选项，按定义次序（结果栏标签、地址栏共用） */
export const selectedOptions = (f: FilterState) =>
  f.def.options.filter((option) => f.selected.has(option.id));

/** 技能落在作用对象行的哪些选项上（游戏 _CheckBuffMatchesTarget：buff.targets 含不含这一组的对象） */
const targetCache = new WeakMap<Buff, string[]>();
export function targetIds(buff: Buff): string[] {
  let ids = targetCache.get(buff);
  if (!ids) {
    ids = buff.room.targets
      .filter((t) => t.targets.some((x) => buff.targets.includes(x)))
      .map((t) => t.id);
    targetCache.set(buff, ids);
  }
  return ids;
}

function buffValues(id: FilterId, buff: Buff): string[] {
  return id === "room" ? [buff.room.id] : targetIds(buff);
}

function holderValues(id: FilterId, h: Holding): string[] {
  if (id === "phase") return [h.cond];
  if (id === "rarity") return [String(h.char.stars)];
  return [h.char.profession];
}

export const normalizeNeedle = (q: string) => q.trim().toLowerCase();

export interface Query {
  filters: Filters;
  needle: string;
  /** 设施页里嵌着的那份：只看这个设施 */
  room?: Room;
}

/** 一位持有者过不过持有者那三行；skip = 算「这一行还有没有可点的选项」时跳过的那一行 */
export function holderPass(h: Holding, q: Query, skip?: FilterId): boolean {
  return HOLDER_IDS.every((id) => {
    const { selected } = q.filters[id];
    return (
      id === skip ||
      selected.size === 0 ||
      holderValues(id, h).some((v) => selected.has(v))
    );
  });
}

/** 搜索：技能名、描述（含术语）、持有干员的名字 */
function textPass(buff: Buff, needle: string) {
  return (
    !needle ||
    buff.haystack.includes(needle) ||
    buff.holders.some((h) => h.char.name.toLowerCase().includes(needle))
  );
}

/** 作用对象只约束自己那个设施的技能：选着制造站 + 加工站、点「贵金属」，加工站的技能不受影响 */
function targetPass(buff: Buff, q: Query) {
  const { selected } = q.filters.target;
  if (!buff.room.targets.some((t) => selected.has(t.id))) return true;
  return targetIds(buff).some((id) => selected.has(id));
}

/** noHolder = 不看持有者那三行（干员视图里持有者就是这位干员，另算） */
function scopePass(buff: Buff, q: Query, skip?: FilterId) {
  if (q.room && buff.room !== q.room) return false;
  const rooms = q.filters.room.selected;
  if (skip !== "room" && rooms.size > 0 && !rooms.has(buff.room.id))
    return false;
  return skip === "target" || targetPass(buff, q);
}

export function buffPass(buff: Buff, q: Query, skip?: FilterId): boolean {
  if (!textPass(buff, q.needle) || !scopePass(buff, q, skip)) return false;
  const holderActive = HOLDER_IDS.some(
    (id) => id !== skip && q.filters[id].selected.size > 0,
  );
  return !holderActive || buff.holders.some((h) => holderPass(h, q, skip));
}

/** 持有者那三行有没有选着：有的话结果里不符合的持有者压淡、符合的排前面 */
export const holderActive = (filters: Filters) =>
  HOLDER_IDS.some((id) => filters[id].selected.size > 0);

/** 干员视图：一槽里的一级技能过不过（搜索命中这位干员的名字也算） */
export function stepPass(h: Holding, q: Query): boolean {
  const text =
    !q.needle ||
    h.buff.haystack.includes(q.needle) ||
    h.char.name.toLowerCase().includes(q.needle);
  return text && scopePass(h.buff, q) && holderPass(h, q);
}

/** 干员视图：至少有一级技能过 */
export const charPass = (c: Char, q: Query) =>
  c.slots.some((chain) => chain.some((h) => stepPass(h, q)));

/**
 * 每一行里点了也不会多出技能的选项（芯片压淡，仍可点）：
 * 其余条件不变，看有没有技能（持有者那三行看持有者）落在这个选项上。
 */
export function emptyOptions(
  buffs: readonly Buff[],
  q: Query,
): Map<FilterId, Set<string>> {
  const out = new Map<FilterId, Set<string>>();
  for (const id of FILTER_IDS) {
    const f = q.filters[id];
    const reach = new Set<string>();
    for (const buff of buffs) {
      if (!buffPass(buff, q, id)) continue;
      if (f.def.holder) {
        for (const h of buff.holders)
          if (holderPass(h, q, id))
            for (const v of holderValues(id, h)) reach.add(v);
      } else for (const v of buffValues(id, buff)) reach.add(v);
    }
    out.set(
      id,
      new Set(f.def.options.map((o) => o.id).filter((oid) => !reach.has(oid))),
    );
  }
  return out;
}
