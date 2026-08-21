import type { DecisionId, OptionIndex } from "./types";

/**
 * 路径条件：一组「选择组合」的并集（DNF）。
 *
 * 符号执行只会产生两种组合——旧条件 ∧ 新选择（decision 分裂）、相同状态
 * 的条件 OR 合并（状态汇合）——而且每行合并后都会按可达域投影，所以条件
 * 始终极小（全语料实测：最多 2 个乘积，每个乘积最多 4 个字面量）。
 *
 * 因此这里不建表达式树，直接存乘积集合：∧ 是叉乘，∨ 是并集 + 子集吸收
 * （乘积 P ⊆ Q 时 Q 蕴含 P，Q 冗余），求值是两层循环，展示用的 DNF 就是
 * 存储形态本身，不需要再展开。
 *
 * 条件按规范化后的乘积集合内化成 id：相同条件必然拿到同一个 id，
 * document 层可以直接用 === 比较 audience。
 */

/** 一个乘积：每个已约束 decision → 选中的 optionIndex；空乘积恒真 */
type Product = Map<DecisionId, OptionIndex>;

/** id 0 保留给恒真 */
export const TRUE_CONDITION = 0 as const;

/**
 * 单个条件的乘积数上限。超过后该条件放宽成恒真并置 degraded，
 * 与符号状态超限共用一套退化契约：宁可丢掉分支标注，也不能开天窗。
 */
const MAX_PRODUCTS = 256;

/** 超过这个乘积数就不再尝试合并展示（真实语料里最多 2 个） */
const MAX_MERGE_PRODUCTS = 32;

/** describe() 的输出 */
export type DisplayCondition =
  | { kind: "always" }
  | { kind: "any"; alternatives: readonly DisplayAlternative[] };

export interface DisplayAlternative {
  /** 必须全部满足的选择；同一 decision 的多个 optionIndex 是“或” */
  choices: readonly {
    decisionId: DecisionId;
    optionIndexes: readonly OptionIndex[];
  }[];
}

export class ConditionStore {
  /** 每个 id 对应一组规范化乘积；id 0 = 恒真（单个空乘积） */
  private readonly conditions: Product[][] = [[new Map()]];
  private readonly cache = new Map<string, number>([["", TRUE_CONDITION]]);
  private overflowed = false;

  /** 有条件超过乘积上限被放宽成恒真 */
  get degraded(): boolean {
    return this.overflowed;
  }

  /** 内化过的不同条件数，用于规模监控 */
  get size(): number {
    return this.conditions.length;
  }

  true(): number {
    return TRUE_CONDITION;
  }

  choice(decisionId: DecisionId, optionIndex: OptionIndex): number {
    return this.intern([new Map([[decisionId, optionIndex]])]);
  }

  and(left: number, right: number): number {
    if (left === TRUE_CONDITION) return right;
    if (right === TRUE_CONDITION) return left;
    if (left === right) return left;
    return this.intern(crossJoin(this.products(left), this.products(right)));
  }

  or(operands: readonly number[]): number {
    const merged: Product[] = [];
    for (const id of operands) {
      if (id === TRUE_CONDITION) return TRUE_CONDITION;
      merged.push(...this.products(id));
    }
    return this.intern(merged);
  }

  /** 条件中引用过的全部 decision */
  referencedDecisions(id: number): Set<DecisionId> {
    const result = new Set<DecisionId>();
    for (const product of this.products(id))
      for (const decisionId of product.keys()) result.add(decisionId);
    return result;
  }

  /**
   * 二值求值。assignment 给出每个已做选择的 decision → optionIndex；
   * 未赋值的 decision 视为“任意”会污染结果，调用方应传完整历史。
   */
  evaluate(id: number, assignment: Map<DecisionId, OptionIndex>): boolean {
    return this.products(id).some((product) =>
      product
        .entries()
        .every(
          ([decisionId, optionIndex]) =>
            assignment.get(decisionId) === optionIndex,
        ),
    );
  }

  /**
   * 三值求值：未赋值 = unknown。true / false / null(unknown)。
   * 用于“当前路径可能看到这段文本”的判断（部分历史）。
   */
  evaluatePartial(
    id: number,
    assignment: Map<DecisionId, OptionIndex>,
  ): boolean | null {
    let unknown = false;
    for (const product of this.products(id)) {
      let productUnknown = false;
      let contradicted = false;
      for (const [decisionId, optionIndex] of product) {
        const chosen = assignment.get(decisionId);
        if (chosen === undefined) productUnknown = true;
        else if (chosen !== optionIndex) {
          contradicted = true;
          break;
        }
      }
      if (contradicted) continue;
      if (!productUnknown) return true;
      unknown = true;
    }
    return unknown ? null : false;
  }

  /**
   * 在“每个 decision 只能取其可达选项”的约束下是否为永真。
   * 用 DFS 逐 decision 赋值并同步过滤乘积，无乘积可匹配时立即剪枝；
   * 缺少域信息时保守返回 false。
   */
  isTautology(
    id: number,
    reachableOptions: Map<DecisionId, readonly OptionIndex[]>,
  ): boolean {
    if (id === TRUE_CONDITION) return true;
    const decisions = [...this.referencedDecisions(id)];
    const domains = decisions.map(
      (decisionId) => reachableOptions.get(decisionId) ?? [],
    );

    const consistent = (
      product: Product,
      decisionId: DecisionId,
      optionIndex: OptionIndex | undefined,
    ): boolean =>
      optionIndex === undefined
        ? !product.has(decisionId)
        : !product.has(decisionId) || product.get(decisionId) === optionIndex;

    const dfs = (index: number, remaining: readonly Product[]): boolean => {
      if (remaining.length === 0) return false;
      if (index === decisions.length) return true;
      const decisionId = decisions[index]!;
      const domain = domains[index]!;
      const options: readonly (OptionIndex | undefined)[] =
        domain.length > 0 ? domain : [undefined];
      return options.every((optionIndex) =>
        dfs(
          index + 1,
          remaining.filter((product) =>
            consistent(product, decisionId, optionIndex),
          ),
        ),
      );
    };
    return dfs(0, this.products(id));
  }

  /**
   * 按 decision 的可达选项域做展示等价简化：
   * 若条件在“把 d 投影掉”后于可达历史上等价（每个乘积组都覆盖 d 的
   * 全部选项），则删掉对 d 的引用。典型收益：
   * or(D1=A∧D2=x, D1=A∧D2=y) → D1=A（每个走到这的玩家都做了内层选择）。
   */
  normalizeByDomains(
    id: number,
    domains: Map<DecisionId, readonly OptionIndex[]>,
  ): number {
    let current: Product[] = this.products(id).map(
      (product) => new Map(product),
    );
    let projected = false;
    let changed = true;
    while (changed) {
      changed = false;
      for (const decisionId of new Set(current.flatMap((p) => [...p.keys()]))) {
        const domain = domains.get(decisionId);
        if (!domain || domain.length === 0) continue;
        // 有乘积不约束该 decision：存在没执行过它的路径，不能投影
        if (current.some((product) => !product.has(decisionId))) continue;

        const groups = new Map<string, Set<OptionIndex>>();
        for (const product of current) {
          const rest = new Map(product);
          const own = rest.get(decisionId)!;
          rest.delete(decisionId);
          const key = productKey(rest);
          const covered = groups.get(key) ?? new Set<OptionIndex>();
          covered.add(own);
          groups.set(key, covered);
        }
        const full = new Set(domain);
        const coverable = groups
          .values()
          .every(
            (covered) =>
              covered.size === full.size &&
              covered.values().every((option) => full.has(option)),
          );
        if (!coverable) continue;

        current = current.map((product) => {
          const rest = new Map(product);
          rest.delete(decisionId);
          return rest;
        });
        projected = true;
        changed = true;
      }
    }

    // intern 负责去重、吸收与恒真判定
    return projected ? this.intern(current) : id;
  }

  /** 人类可读展示用的 DNF */
  describe(id: number): DisplayCondition {
    if (id === TRUE_CONDITION) return { kind: "always" };
    return { alternatives: mergeProducts(this.products(id)), kind: "any" };
  }

  private products(id: number): readonly Product[] {
    return this.conditions[id]!;
  }

  private intern(products: readonly Product[]): number {
    const canonical = canonicalize(products);
    if (!canonical) {
      // 乘积数失控：放宽成恒真，与状态超限同一套退化契约
      this.overflowed = true;
      return TRUE_CONDITION;
    }

    const key = conditionKey(canonical);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const id = this.conditions.length;
    this.conditions.push(canonical);
    this.cache.set(key, id);
    return id;
  }
}

/**
 * 规范化：去重、吸收（P ⊆ Q ⟹ Q 冗余）、按 key 排序。
 * 出现空乘积即恒真；超过乘积上限返回 null。
 */
function canonicalize(products: readonly Product[]): Product[] | null {
  const unique = new Map<string, Product>();
  for (const product of products) {
    if (product.size === 0) return [new Map()];
    unique.set(productKey(product), product);
  }

  // 先看约束少的：更弱的乘积会吸收掉所有包含它的乘积
  const kept: Product[] = [];
  for (const candidate of [...unique.values()].sort((a, b) => a.size - b.size))
    if (kept.every((weaker) => !covers(candidate, weaker)))
      kept.push(candidate);

  if (kept.length > MAX_PRODUCTS) return null;
  return kept.sort((a, b) => productKey(a).localeCompare(productKey(b)));
}

/** product ⊇ weaker：product 的约束更强，蕴含 weaker */
function covers(product: Product, weaker: Product): boolean {
  if (weaker.size > product.size) return false;
  for (const [decisionId, optionIndex] of weaker)
    if (product.get(decisionId) !== optionIndex) return false;
  return true;
}

function crossJoin(
  left: readonly Product[],
  right: readonly Product[],
): Product[] {
  const output: Product[] = [];
  for (const l of left) {
    for (const r of right) {
      const product = new Map(l);
      let contradiction = false;
      for (const [decisionId, optionIndex] of r) {
        const existing = product.get(decisionId);
        if (existing !== undefined && existing !== optionIndex) {
          contradiction = true;
          break;
        }
        product.set(decisionId, optionIndex);
      }
      if (!contradiction) output.push(product);
    }
  }
  return output;
}

function productKey(product: Product): string {
  return [...product.entries()]
    .sort(([a], [b]) => a - b)
    .map(([decisionId, optionIndex]) => `${decisionId}=${optionIndex}`)
    .join(";");
}

/** 恒真是「单个空乘积」→ ""；恒假是「没有乘积」，两者必须可区分 */
function conditionKey(products: readonly Product[]): string {
  return products.length === 0
    ? "\u{0}"
    : products.map((product) => productKey(product)).join("|");
}

/**
 * 把乘积合并成展示形状：仅在一个 decision 上取值不同的乘积合并为同一
 * alternative 的多个 optionIndex（D1=A ∨ D1=B → 「A / B」）。
 */
function mergeProducts(products: readonly Product[]): DisplayAlternative[] {
  type MutableChoice = {
    decisionId: DecisionId;
    optionIndexes: OptionIndex[];
  };

  let alternatives: MutableChoice[][] = products.map((product) =>
    [...product.entries()]
      .sort(([a], [b]) => a - b)
      .map(([decisionId, optionIndex]) => ({
        decisionId,
        optionIndexes: [optionIndex],
      })),
  );

  // 反复合并：两个 alternative 只在一个 decision 的取值集合上不同、
  // 其余 decision 完全一致时，合并该 decision 的取值集合。
  let changed = alternatives.length <= MAX_MERGE_PRODUCTS;
  while (changed) {
    changed = false;
    for (let i = 0; i < alternatives.length && !changed; i += 1) {
      for (let j = i + 1; j < alternatives.length; j += 1) {
        const merged = tryMerge(alternatives[i]!, alternatives[j]!);
        if (merged) {
          alternatives = [
            ...alternatives.filter((_, index) => index !== i && index !== j),
            merged,
          ];
          changed = true;
          break;
        }
      }
    }
  }

  return alternatives.map((choices) => ({
    choices: choices.map((choice) => ({
      decisionId: choice.decisionId,
      optionIndexes: [...choice.optionIndexes].sort((a, b) => a - b),
    })),
  }));
}

function tryMerge(
  left: { decisionId: DecisionId; optionIndexes: OptionIndex[] }[],
  right: { decisionId: DecisionId; optionIndexes: OptionIndex[] }[],
): { decisionId: DecisionId; optionIndexes: OptionIndex[] }[] | null {
  if (left.length !== right.length) return null;
  let differing: { decisionId: DecisionId; options: OptionIndex[] } | null =
    null;

  for (const [i, element] of left.entries()) {
    const a = element!;
    const b = right[i]!;
    if (a.decisionId !== b.decisionId) return null;
    if (setsEqual(a.optionIndexes, b.optionIndexes)) continue;
    if (differing) return null;
    differing = {
      decisionId: a.decisionId,
      options: [...new Set([...a.optionIndexes, ...b.optionIndexes])],
    };
  }
  if (!differing) return null;
  return left.map((choice) =>
    choice.decisionId === differing!.decisionId
      ? {
          decisionId: choice.decisionId,
          optionIndexes: [...differing!.options],
        }
      : choice,
  );
}

function setsEqual(left: OptionIndex[], right: OptionIndex[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}
