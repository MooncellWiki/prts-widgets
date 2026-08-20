import type { DecisionId, OptionIndex } from "./types";

/**
 * 路径条件的 hash-consed 表达式 DAG。
 *
 * 符号执行只会产生两种组合：
 * - 旧条件 ∧ 新选择（decision 分裂）；
 * - 相同状态的条件 OR 合并（状态汇合）。
 *
 * 因此这里不做通用 SAT：规范化只做幂等、吸收（A ∨ A∧B = A）与
 * 浅层矛盾检测，求值用三值/二值递归即可。
 */

export const TRUE_CONDITION = 0 as const;

type ChoiceNode = {
  kind: "choice";
  decisionId: DecisionId;
  optionIndex: OptionIndex;
};
type AndNode = { kind: "and"; left: number; right: number };
type OrNode = { kind: "or"; operands: readonly number[] };

type ConditionNode = ChoiceNode | AndNode | OrNode;

/** describe() 的输出：按展示需要展开的 DNF（带规模上限） */
export type DisplayCondition =
  | { kind: "always" }
  | { kind: "complex" }
  | { kind: "any"; alternatives: readonly DisplayAlternative[] };

export interface DisplayAlternative {
  /** 必须全部满足的选择；同一 decision 的多个 optionIndex 是“或” */
  choices: readonly {
    decisionId: DecisionId;
    optionIndexes: readonly OptionIndex[];
  }[];
}

/** DNF 展开的上限：超过后 describe 退化为 complex，底层条件仍然精确 */
const MAX_DNF_PRODUCTS = 256;

/** entails 记忆化的组合键步长；节点 id 远小于 2^26 */
const PAIR_KEY_STRIDE = 1 << 26;

export class ConditionStore {
  /** id 0 保留给 true */
  private readonly nodes: ConditionNode[] = [
    { kind: "and", left: 0, right: 0 },
  ];
  private readonly cache = new Map<string, number>();
  private readonly dnfCache = new Map<number, Product[] | null>();
  private readonly dependsCache = new Map<number, Set<DecisionId>>();
  /** (a,b) 对的记忆化：or() 吸收会反复查询相同对，不缓存会指数膨胀 */
  private readonly entailsCache = new Map<number, boolean>();

  get nodeCount(): number {
    return this.nodes.length;
  }

  node(id: number): ConditionNode {
    return this.nodes[id]!;
  }

  true(): number {
    return TRUE_CONDITION;
  }

  choice(decisionId: DecisionId, optionIndex: OptionIndex): number {
    return this.intern(
      { kind: "choice", decisionId, optionIndex },
      `c${decisionId}=${optionIndex}`,
    );
  }

  and(left: number, right: number): number {
    if (left === TRUE_CONDITION) return right;
    if (right === TRUE_CONDITION) return left;
    if (left === right) return left;
    return this.intern({ kind: "and", left, right }, `a(${left},${right})`);
  }

  or(operands: readonly number[]): number {
    const flat: number[] = [];
    const push = (id: number): void => {
      const node = this.nodes[id];
      if (node?.kind === "or") {
        for (const child of node.operands) push(child);
        return;
      }
      if (!flat.includes(id)) flat.push(id);
    };
    for (const id of operands) {
      if (id === TRUE_CONDITION) return TRUE_CONDITION;
      push(id);
    }
    if (flat.length === 0) return TRUE_CONDITION;
    if (flat.length === 1) return flat[0]!;

    // 吸收：A ∨ (A∧B) = A（保留弱项）。candidate ⇒ kept 时 candidate 冗余；
    // kept ⇒ candidate 时 kept 被更弱的 candidate 吸收。
    const absorbed: number[] = [];
    for (const candidate of flat) {
      if (absorbed.some((kept) => this.entails(candidate, kept))) continue;
      for (let i = absorbed.length - 1; i >= 0; i -= 1) {
        if (this.entails(absorbed[i]!, candidate)) absorbed.splice(i, 1);
      }
      absorbed.push(candidate);
    }
    if (absorbed.length === 0) return TRUE_CONDITION;
    if (absorbed.length === 1) return absorbed[0]!;

    const sorted = [...absorbed].sort((a, b) => a - b);
    return this.intern(
      { kind: "or", operands: sorted },
      `o[${sorted.join(",")}]`,
    );
  }

  /**
   * a ⇒ b 的保守结构判断（只处理本引擎会产生的形状）。
   * 记忆化按 (a,b) 缓存；节点只增不改，结果稳定。
   */
  entails(a: number, b: number): boolean {
    if (a === b) return true;
    if (b === TRUE_CONDITION) return true;
    if (a === TRUE_CONDITION) return false;

    const key = a * PAIR_KEY_STRIDE + b;
    const cached = this.entailsCache.get(key);
    if (cached !== undefined) return cached;

    // 子节点 id 恒小于父节点（intern 保证），递归不会回到自身
    let result = false;
    const nodeA = this.nodes[a]!;
    if (nodeA.kind === "and") {
      result = this.entails(nodeA.left, b) || this.entails(nodeA.right, b);
    } else if (nodeA.kind === "or") {
      // (x ∨ y) ⇒ b ⟺ x ⇒ b 且 y ⇒ b
      result = nodeA.operands.every((operand) => this.entails(operand, b));
    } else {
      const nodeB = this.nodes[b]!;
      if (nodeB.kind === "or")
        result = nodeB.operands.some((operand) => this.entails(a, operand));
      else if (nodeB.kind === "and")
        result = this.entails(a, nodeB.left) && this.entails(a, nodeB.right);
    }

    this.entailsCache.set(key, result);
    return result;
  }

  /** 条件中引用过的全部 decision（含嵌套）。节点级记忆化：DAG 有共享
   * 子节点，不做记忆化的遍历是路径枚举，规模是指数级的 */
  referencedDecisions(id: number): Set<DecisionId> {
    return this.collectDepends(id);
  }

  private collectDepends(id: number): Set<DecisionId> {
    if (id === TRUE_CONDITION) return new Set();
    const cached = this.dependsCache.get(id);
    if (cached) return cached;

    const node = this.nodes[id]!;
    let result: Set<DecisionId>;
    if (node.kind === "choice") {
      result = new Set([node.decisionId]);
    } else if (node.kind === "and") {
      result = new Set([
        ...this.collectDepends(node.left),
        ...this.collectDepends(node.right),
      ]);
    } else {
      result = new Set();
      for (const operand of node.operands)
        for (const decisionId of this.collectDepends(operand))
          result.add(decisionId);
    }
    this.dependsCache.set(id, result);
    return result;
  }

  /**
   * 二值求值。assignment 给出每个已做选择的 decision → optionIndex；
   * 未赋值的 decision 视为“任意”会污染结果，调用方应传完整历史。
   */
  evaluate(id: number, assignment: Map<DecisionId, OptionIndex>): boolean {
    return this.evaluateMemo(id, assignment, new Map());
  }

  private evaluateMemo(
    id: number,
    assignment: Map<DecisionId, OptionIndex>,
    memo: Map<number, boolean>,
  ): boolean {
    if (id === TRUE_CONDITION) return true;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;

    let result = false;
    const node = this.nodes[id]!;
    switch (node.kind) {
      case "choice": {
        const chosen = assignment.get(node.decisionId);
        result = chosen !== undefined && chosen === node.optionIndex;
        break;
      }
      case "and": {
        result =
          this.evaluateMemo(node.left, assignment, memo) &&
          this.evaluateMemo(node.right, assignment, memo);
        break;
      }
      case "or": {
        result = node.operands.some((operand) =>
          this.evaluateMemo(operand, assignment, memo),
        );
        break;
      }
    }
    memo.set(id, result);
    return result;
  }

  /**
   * 三值求值：未赋值 = unknown。true / false / null(unknown)。
   * 用于“当前路径可能看到这段文本”的判断（部分历史）。
   */
  evaluatePartial(
    id: number,
    assignment: Map<DecisionId, OptionIndex>,
  ): boolean | null {
    return this.evaluatePartialMemo(id, assignment, new Map());
  }

  private evaluatePartialMemo(
    id: number,
    assignment: Map<DecisionId, OptionIndex>,
    memo: Map<number, boolean | null>,
  ): boolean | null {
    if (id === TRUE_CONDITION) return true;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;

    let result: boolean | null;
    const node = this.nodes[id]!;
    switch (node.kind) {
      case "choice": {
        const chosen = assignment.get(node.decisionId);
        result = chosen === undefined ? null : chosen === node.optionIndex;
        break;
      }
      case "and": {
        const left = this.evaluatePartialMemo(node.left, assignment, memo);
        const right = this.evaluatePartialMemo(node.right, assignment, memo);
        if (left === false || right === false) result = false;
        else if (left === null || right === null) result = null;
        else result = true;
        break;
      }
      case "or": {
        const operands = node.operands.map((operand) =>
          this.evaluatePartialMemo(operand, assignment, memo),
        );
        if (operands.includes(true)) result = true;
        else if (operands.every((value) => value === false)) result = false;
        else result = null;
        break;
      }
    }
    memo.set(id, result);
    return result;
  }

  /** 展开成受限 DNF；超限返回 null（调用方按保守策略处理） */
  private dnf(id: number): Product[] | null {
    if (id === TRUE_CONDITION) return [new Map()];
    const cached = this.dnfCache.get(id);
    if (cached !== undefined) return cached;

    let result: Product[] | null;
    const node = this.nodes[id]!;
    switch (node.kind) {
      case "choice": {
        const product = new Map<DecisionId, OptionIndex>([
          [node.decisionId, node.optionIndex],
        ]);
        result = [product];
        break;
      }
      case "and": {
        const left = this.dnf(node.left);
        const right = this.dnf(node.right);
        result = left && right ? crossJoin(left, right) : null;
        break;
      }
      case "or": {
        const merged = new Map<string, Product>();
        let overflow = false;
        for (const operand of node.operands) {
          const products = this.dnf(operand);
          if (!products) {
            overflow = true;
            break;
          }
          for (const product of products) {
            merged.set(productKey(product), product);
            if (merged.size > MAX_DNF_PRODUCTS) {
              overflow = true;
              break;
            }
          }
          if (overflow) break;
        }
        result = overflow ? null : [...merged.values()];
        break;
      }
    }

    if (result && result.length > MAX_DNF_PRODUCTS) result = null;
    this.dnfCache.set(id, result);
    return result;
  }

  /**
   * 条件是否与 decision d 的取值无关：把 d 固定为它的每个可能选项后，
   * 条件在其余自由变量上的投影都相同。allOptions 必须传该 decision 的
   * 全部选项（只看乘积里出现过的取值会把“仅部分选项可见”误判为无关）。
   */
  independentOf(
    id: number,
    decisionId: DecisionId,
    allOptions: readonly OptionIndex[],
  ): boolean {
    if (id === TRUE_CONDITION) return true;
    if (!this.referencedDecisions(id).has(decisionId)) return true;
    const products = this.dnf(id);
    if (!products) return false; // 展开超限：保守视为有影响

    const project = (fixed: OptionIndex): Set<string> => {
      const keys = new Set<string>();
      for (const product of products) {
        const own = product.get(decisionId);
        if (own !== undefined && own !== fixed) continue;
        const rest = new Map(product);
        rest.delete(decisionId);
        keys.add(productKey(rest));
      }
      return keys;
    };

    const signatures = new Set<string>();
    for (const optionIndex of allOptions)
      signatures.add(keyOf(project(optionIndex)));
    return signatures.size <= 1;
  }

  /**
   * 在“每个 decision 只能取其可达选项”的约束下是否为永真。
   * reachableOptions 通常来自文档中该 decision 的全部选项。
   * 用 DFS 逐 decision 赋值并同步过滤乘积，无乘积可匹配时立即剪枝；
   * 展开超限或缺少域信息时保守返回 false。
   */
  isTautology(
    id: number,
    reachableOptions: Map<DecisionId, readonly OptionIndex[]>,
  ): boolean {
    if (id === TRUE_CONDITION) return true;
    const products = this.dnf(id);
    if (!products) return false;

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
    return dfs(0, products);
  }

  /**
   * 按 decision 的可达选项域做展示等价简化：
   * 若条件在“把 d 投影掉”后于可达历史上等价（每个乘积组都覆盖 d 的
   * 全部选项），则删掉对 d 的引用。典型收益：
   * or(D1=A∧D2=x, D1=A∧D2=y) → D1=A（每个走到这的玩家都做了内层选择）。
   *
   * 全程在 DNF 乘积数组上批量投影、最后只重建一次条件；
   * 展示专用；底层条件不动。展开超限时原样返回。
   */
  normalizeByDomains(
    id: number,
    domains: Map<DecisionId, readonly OptionIndex[]>,
  ): number {
    const products = this.dnf(id);
    if (!products) return id;

    let current: Product[] = products.map((product) => new Map(product));
    let projected = false;
    let changed = true;
    while (changed) {
      changed = false;
      for (const decisionId of new Set(current.flatMap((p) => [...p.keys()]))) {
        const domain = domains.get(decisionId);
        if (!domain || domain.length === 0) continue;
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
        let coverable = true;
        for (const covered of groups.values()) {
          if (
            covered.size !== full.size ||
            [...covered].some((option) => !full.has(option))
          ) {
            coverable = false;
            break;
          }
        }
        if (!coverable) continue;

        const seen = new Set<string>();
        current = current
          .filter((product) => {
            const rest = new Map(product);
            rest.delete(decisionId);
            const key = productKey(rest);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((product) => {
            const rest = new Map(product);
            rest.delete(decisionId);
            return rest;
          });
        projected = true;
        changed = true;
      }
    }

    if (!projected) return id;
    if (current.some((product) => product.size === 0)) return TRUE_CONDITION;

    // 乘积已去重规范化，直接 intern，无需吸收
    const productIds = current
      .map((product) => {
        let condition: number = TRUE_CONDITION;
        for (const [decisionId, optionIndex] of [...product.entries()].sort(
          ([a], [b]) => a - b,
        )) {
          condition = this.and(condition, this.choice(decisionId, optionIndex));
        }
        return condition;
      })
      .sort((a, b) => a - b);
    if (productIds.length === 1) return productIds[0]!;
    return this.intern(
      { kind: "or", operands: productIds },
      `o[${productIds.join(",")}]`,
    );
  }

  /** 人类可读展示；底层条件精确，超限时只影响文案 */
  describe(id: number): DisplayCondition {
    if (id === TRUE_CONDITION) return { kind: "always" };
    const products = this.dnf(id);
    if (!products) return { kind: "complex" };

    const alternatives = mergeProducts(products);
    if (alternatives === null) return { kind: "complex" };
    if (alternatives.length === 1 && alternatives[0]!.choices.length === 0)
      return { kind: "always" };
    return { kind: "any", alternatives };
  }

  private intern(node: ConditionNode, key: string): number {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const id = this.nodes.length;
    this.nodes.push(node);
    this.cache.set(key, id);
    return id;
  }
}

/** DNF 乘积：每个已约束 decision → 选中的 optionIndex */
type Product = Map<DecisionId, OptionIndex>;

function crossJoin(left: Product[], right: Product[]): Product[] | null {
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
      if (!contradiction) {
        output.push(product);
        if (output.length > 256) return null;
      }
    }
  }
  return output;
}

function productKey(product: Product): string {
  return [...product.entries()]
    .map(([decisionId, optionIndex]) => `${decisionId}=${optionIndex}`)
    .sort((a, b) => a.localeCompare(b))
    .join(";");
}

function keyOf(set: Set<string>): string {
  // 带上前缀长度：空集合（无乘积可满足）与只含空乘积（恒真）必须可区分
  return `${set.size}\u{2}${[...set].sort((a, b) => a.localeCompare(b)).join("|")}`;
}

/**
 * 把 DNF 乘积合并成展示形状：仅在一个 decision 上取值不同的乘积
 * 合并为同一 alternative 的多个 optionIndex（D1=A ∨ D1=B → 「A / B」）。
 */
function mergeProducts(products: Product[]): DisplayAlternative[] | null {
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
  let changed = true;
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
    if (alternatives.length > 32) return null;
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
