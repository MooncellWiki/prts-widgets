import type { FilterDef } from "./consts";
import type { Char } from "./utils";

/** 一行筛选的定义 + 当前选择 */
export interface FilterState {
  title: string;
  field: string;
  /** 这一行有没有「同时满足」（只有词缀行有） */
  canAnd: boolean;
  and: boolean;
  /** 已选的选项（存的是选项的 label） */
  sel: Set<string>;
  labels: string[];
  /** label → 它代表的值（大多数选项就是自己；「其他势力」这类一个选项管好几个值） */
  values: Map<string, string[]>;
  /** 本行所有选项覆盖到的值；「其他」= 值不在这里面 */
  known: Set<string>;
  hasOther: boolean;
}

export function createFilters(defs: FilterDef[]): FilterState[] {
  return defs.map((def) => {
    const values = new Map(
      def.options.map((o): [string, string[]] =>
        typeof o === "string" ? [o, [o]] : [o.label, o.value],
      ),
    );
    return {
      title: def.title,
      field: def.field,
      canAnd: def.canAnd ?? false,
      and: false,
      sel: new Set<string>(),
      labels: Array.from(values.keys()),
      values,
      known: new Set(Array.from(values.values()).flat()),
      hasOther: values.has("其他"),
    };
  });
}

/** 干员是否满足这一行：sel / and 单独传，好拿「再点这一项会怎样」去试 */
export function matchFilter(
  f: FilterState,
  char: Char,
  sel: ReadonlySet<string> = f.sel,
  and: boolean = f.and,
): boolean {
  const value = char[f.field as keyof Char] as string | string[] | number;
  const range: string[] = [];
  for (const label of sel) range.push(...(f.values.get(label) ?? []));

  if (and) return range.every((k) => Array.isArray(value) && value.includes(k));
  if (range.length === 0) return true;
  if (f.field === "rarity") return sel.has(`★${char.stars}`);
  if (f.field === "sex")
    return (
      sel.has(`${char.sex}性`) ||
      (sel.has("其他") && char.sex !== "男" && char.sex !== "女")
    );

  const hit = Array.isArray(value)
    ? range.some((v) => value.includes(v))
    : range.includes(value as string);
  if (hit || !(f.hasOther && sel.has("其他"))) return hit;
  return Array.isArray(value)
    ? value.some((v) => !f.known.has(v))
    : !f.known.has(value as string);
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
  for (const label of f.labels) {
    if (f.sel.has(label)) continue;
    const sel = f.and ? new Set([...f.sel, label]) : new Set([label]);
    if (!others.some((char) => matchFilter(f, char, sel, f.and)))
      out.add(label);
  }
  return out;
}

/** 职业与分支是「且」：选了职业，别的职业名下已选的分支一并取消（留着只会筛出 0 条） */
export function dropOrphanBranches(
  profession: FilterState | undefined,
  branch: FilterState | undefined,
  branchProf: Map<string, string>,
) {
  if (!profession || !branch || profession.sel.size === 0) return;
  for (const label of Array.from(branch.sel)) {
    const prof = branchProf.get(label);
    if (prof && !profession.sel.has(prof)) branch.sel.delete(label);
  }
}
