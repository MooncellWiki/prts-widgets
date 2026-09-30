import { FILTERS, type FilterDef, type FilterId } from "./filters";
import { BRANCH_BY_NAME } from "./professions";

import type { Char } from "./utils";

export interface FilterSelection {
  selected: Set<string>;
  and: boolean;
}

/** 固定定义只读；每个实例独立维护选择状态。 */
export interface FilterState {
  readonly id: FilterId;
  readonly def: FilterDef;
  selection: FilterSelection;
}

export function createFilters(): Record<FilterId, FilterState> {
  return Object.fromEntries(
    (Object.keys(FILTERS) as FilterId[]).map((id) => [
      id,
      {
        id,
        // Vue 不代理固定定义，响应式部分只有 selection。
        def: Object.freeze(FILTERS[id]),
        selection: { selected: new Set<string>(), and: false },
      },
    ]),
  ) as Record<FilterId, FilterState>;
}

/** 同一套匹配规则用于结果与选项置灰。 */
export function matchFilter(
  f: FilterState,
  char: Char,
  selected: ReadonlySet<string> = f.selection.selected,
  and: boolean = f.selection.and,
): boolean {
  if (selected.size === 0) return true;
  const options = f.def.options.filter((option) => selected.has(option.id));
  return and && f.def.canAnd
    ? options.every((option) => option.matches(char))
    : options.some((option) => option.matches(char));
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
