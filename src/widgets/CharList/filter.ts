import {
  DEFAULT_MATCH,
  FILTERS,
  type FilterDef,
  type FilterId,
  type FilterOption,
  type MatchContext,
} from "./filters";
import { BRANCH_BY_NAME } from "./professions";

import type { Char } from "./utils";

export interface FilterSelection {
  selected: Set<string>;
  and: boolean;
  /** 「势力」行：作战模式，改查 ingameFaction（档案模式为 false） */
  combat: boolean;
  /** 「势力」行：作战模式下连 ingameFaction.hidden 一起查（档案模式里没有意义） */
  hidden: boolean;
}

/** 固定定义只读；每个实例独立维护选择状态。 */
export interface FilterState {
  readonly id: FilterId;
  readonly def: FilterDef;
  selection: FilterSelection;
}

/** 各行 id → 选项：匹配时按已选的 id 直接取，不用每次扫一遍整行选项。 */
const OPTION_BY_ID = Object.fromEntries(
  (Object.keys(FILTERS) as FilterId[]).map(
    (id): [FilterId, ReadonlyMap<string, FilterOption>] => [
      id,
      new Map(FILTERS[id].options.map((option) => [option.id, option])),
    ],
  ),
) as Record<FilterId, ReadonlyMap<string, FilterOption>>;

export function createFilters(): Record<FilterId, FilterState> {
  return Object.fromEntries(
    (Object.keys(FILTERS) as FilterId[]).map((id) => [
      id,
      {
        id,
        def: FILTERS[id],
        selection: {
          selected: new Set<string>(),
          and: false,
          combat: false,
          hidden: false,
        },
      },
    ]),
  ) as Record<FilterId, FilterState>;
}

/** 这一行有没有这个选项：地址栏和点选都只收认得的 id。 */
export const hasOption = (f: FilterState, id: string) =>
  OPTION_BY_ID[f.id].has(id);

/** 「同时」（并选 / 同时）只在允许的行上打开：词缀行是一直有的开关，势力行在工具条里。 */
export function setAnd(f: FilterState, and: boolean) {
  f.selection.and = !!f.def.canAnd && and;
}

/** 已选的选项，按定义次序（结果栏标签、地址栏共用）。 */
export const selectedOptions = (f: FilterState) =>
  f.def.options.filter((option) => f.selection.selected.has(option.id));

/** 行级开关 → 匹配上下文；只有声明了 combat 的行（势力）用得上。 */
export const matchContext = (f: FilterState): MatchContext =>
  f.def.combat
    ? { combat: f.selection.combat, hidden: f.selection.hidden }
    : DEFAULT_MATCH;

/** 结果栏标签上的行名：作战模式下「势力」写成「作战势力」 */
export const filterTitle = (f: FilterState) =>
  f.def.combat && f.selection.combat ? `作战${f.def.title}` : f.def.title;

/**
 * 这位干员是不是只有隐藏势力命中了（作战模式 + 开了隐藏势力时才有意义）：
 * 选中的标签一个都不在 ingameFaction.main 里，却至少有一个在 hidden 里。
 * 结果里给这些干员挂「隐藏势力」标志——不然看不出他是靠隐藏势力进来的。
 */
export function hiddenOnlyMatch(f: FilterState, char: Char): boolean {
  if (!f.def.combat || !f.selection.combat || !f.selection.hidden) return false;
  const tags = Array.from(f.selection.selected);
  return (
    tags.length > 0 &&
    !tags.some((tag) => char.ingameFaction.main.includes(tag)) &&
    tags.some((tag) => char.ingameFaction.hidden.includes(tag))
  );
}

/** 「找选项」：名字里含所找文字的选项才显示，已选的一直显示；needle 已经过 normalizeNeedle。 */
export const optionShown = (
  f: FilterState,
  option: FilterOption,
  needle: string,
) =>
  !needle ||
  f.selection.selected.has(option.id) ||
  option.label.toLowerCase().includes(needle);

/** 同一套匹配规则用于结果与选项置灰（ctx 默认取这一行自己的开关）。 */
export function matchFilter(
  f: FilterState,
  char: Char,
  selected: ReadonlySet<string> = f.selection.selected,
  and: boolean = f.selection.and,
  ctx: MatchContext = matchContext(f),
): boolean {
  if (selected.size === 0) return true;
  const options = OPTION_BY_ID[f.id];
  const hit = (id: string) => options.get(id)?.matches(char, ctx) ?? false;
  const ids = Array.from(selected);
  return and ? ids.every(hit) : ids.some(hit);
}

export const normalizeNeedle = (q: string) => q.trim().toLowerCase();

/** 搜索：名称 / 英文名 / 日文名 / 代号 / 特性（不含术语提示的正文），不分大小写 */
export function matchText(char: Char, needle: string): boolean {
  if (!needle) return true;
  return [char.zh, char.en, char.ja, char.id, char.plainFeature].some((t) =>
    t.toLowerCase().includes(needle),
  );
}

/**
 * 每位干员没通过的筛选行（搜索不过的直接不收）：
 * 一行都没有 = 在结果里；恰好一行 = 那一行换个选项就可能进结果，用来算「再点这一项还剩不剩」。
 */
export function failedFilters(
  chars: Char[],
  filters: FilterState[],
  needle: string,
): Map<Char, FilterState[]> {
  const out = new Map<Char, FilterState[]>();
  for (const char of chars) {
    if (!matchText(char, needle)) continue;
    out.set(
      char,
      filters.filter((f) => !matchFilter(f, char)),
    );
  }
  return out;
}

/** 会筛出 0 条的选项：其余条件不变、再点这一项（同时满足时 = 在已选的基础上加这一项） */
export function emptyOptions(
  f: FilterState,
  failed: Map<Char, FilterState[]>,
): Set<string> {
  const others: Char[] = [];
  for (const [char, fails] of failed) {
    if (fails.length === 0 || (fails.length === 1 && fails[0] === f))
      others.push(char);
  }
  const out = new Set<string>();
  for (const { id } of f.def.options) {
    if (f.selection.selected.has(id)) continue;
    const sel = f.selection.and
      ? new Set([...f.selection.selected, id])
      : new Set([id]);
    if (!others.some((char) => matchFilter(f, char, sel, f.selection.and)))
      out.add(id);
  }
  return out;
}

/** 选了职业，清除不属于所选职业的分支；单独的分支条件仍可用于旧链接。 */
export function dropOrphanBranches(
  profession: FilterState,
  branch: FilterState,
) {
  const selected = profession.selection.selected;
  if (selected.size === 0) return;
  for (const name of branch.selection.selected) {
    const parent = BRANCH_BY_NAME.get(name)?.profession;
    if (!parent || !selected.has(parent))
      branch.selection.selected.delete(name);
  }
}
