/**
 * 动作列表的整理规则（不碰 WebGL，单测见 tests/spineViewer.spec.ts）。
 * 取舍见设计稿 /patterns/operator#干员模型。
 */

/** 游戏的动画与逻辑帧率；帧数 = 时长 × 30 */
export const FPS = 30;

/**
 * 动作名的中文注：只注游戏代码里有名有姓的那几个键（战斗 Torappu.Battle.AnimationConsts 的 Idle / Die / Stun / Default…，
 * 基建 VCharacter 状态机的 Relax / Move / Interact / Sit / Sleep / Special）；Skill_2_Loop 这类按干员各取各的名字不猜
 */
export const GLOSS: Record<string, string> = {
  Start: "入场",
  Idle: "待机",
  Attack: "攻击",
  Die: "倒下",
  Stun: "晕眩",
  Default: "默认姿态",
  Relax: "闲置",
  Move: "移动",
  Interact: "交互",
  Sit: "坐下",
  Sleep: "睡眠",
  Special: "特殊动作",
};

/** 骨骼数据里的事件名；OnAttack = 攻击判定 */
export const EVENT_LABEL: Record<string, string> = {
  OnAttack: "攻击判定",
  OnAttackFinished: "攻击结束",
  OnStart: "入场完成",
  OnPlayAudio: "音效",
};

/** 超过这么多个动作才分组 */
const GROUP_THRESHOLD = 8;
const FAMILY: [string, RegExp][] = [
  ["入场", /^Start/],
  ["待机", /^(?:Idle|Default|Relax)/],
  ["攻击", /^(?:Attack|Combat|Reload)/],
  ["技能", /^Skill/],
  ["其它", /./],
];

/** 战斗（CharacterAnimator 的 front / back）在前，基建（VCharacter）在后 */
const MODEL_ORDER = ["正面", "背面", "战斗", "基建"];

/**
 * 一招拆成几段是游戏的惯例：X_Begin（或 _Start / _Pre）→ X / X_Loop / X_Idle → X_End（Consts.Animation 的 BEGIN_ANIM_KEY / END_ANIM_KEY）。
 * 值是段的次序；不带段名的本体是 1
 */
const PHASE: Record<string, number> = {
  Pre: 0,
  Begin: 0,
  Start: 0,
  Loop: 2,
  Idle: 3,
  Break: 5,
  End: 6,
};

export interface AnimEvent {
  name: string;
  time: number;
}

/** 列表 / 时间轴要用的那几项；Stage 读骨骼数据时补上 Animation 本体 */
export interface AnimSummary {
  name: string;
  duration: number;
  /** 帧数（30 帧 / 秒） */
  frames: number;
  /** 骨骼数据里的事件，按时间排 */
  events: AnimEvent[];
  /** OnAttack 所在的帧 = 判定帧 */
  hits: number[];
}

export interface AnimGroup<T extends AnimSummary> {
  title: string;
  items: T[];
}

export function summarize(
  name: string,
  duration: number,
  events: AnimEvent[],
): AnimSummary {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  return {
    name,
    duration,
    frames: Math.round(duration * FPS),
    events: sorted,
    hits: sorted
      .filter((e) => e.name === "OnAttack")
      .map((e) => Math.round(e.time * FPS)),
  };
}

/** meta.json 里时装的次序不固定，「默认」提到最前，其余照旧 */
export function sortSkins(names: string[]): string[] {
  return [...names].sort((a, b) => Number(b === "默认") - Number(a === "默认"));
}

/** 正面 / 背面 / 基建，顺序固定；不认识的放最后 */
export function sortModels(names: string[]): string[] {
  const rank = (m: string) => MODEL_ORDER.indexOf(m) + 1 || 99;
  return [...names].sort((a, b) => rank(a) - rank(b));
}

/** 默认播的动作：战斗 Idle、基建 Relax，都没有就第一个 */
export function defaultAnim<T extends AnimSummary>(anims: T[]): T | undefined {
  return (
    ["Idle", "Relax", "Default"]
      .map((n) => anims.find((a) => a.name === n))
      .find(Boolean) ?? anims[0]
  );
}

/** 拆出招式名与段次序：Skill_2_Begin → ["Skill_2", 0]；没有段名 → [name, 1] */
export function chainOf(name: string): [string, number] {
  const parts = name.split("_");
  for (let i = parts.length - 1; i > 0; i--) {
    if (parts[i] in PHASE)
      return [parts.filter((_, j) => j !== i).join("_"), PHASE[parts[i]]];
  }
  return [name, 1];
}

const chainKey = (name: string) => chainOf(name).join(" ");

/**
 * 按 入场 / 待机 / 攻击 / 技能 / 其它 排；组内同一招的几段挨在一起、按出招顺序（骨骼文件里是字母序），
 * 0 帧的定格姿态（Default）排到本组最后。不超过 8 个时只排序不分组（返回一组，title 为空）
 */
export function groupAnims<T extends AnimSummary>(anims: T[]): AnimGroup<T>[] {
  const groups = FAMILY.map(([title], i) => ({
    title,
    items: anims
      .filter((a) => FAMILY.findIndex(([, re]) => re.test(a.name)) === i)
      .sort(
        (a, b) =>
          Number(!a.duration) - Number(!b.duration) ||
          chainKey(a.name).localeCompare(chainKey(b.name), "en", {
            numeric: true,
          }),
      ),
  })).filter((g) => g.items.length);
  if (anims.length > GROUP_THRESHOLD) return groups;
  return [{ title: "", items: groups.flatMap((g) => g.items) }];
}

/**
 * 连播：播完一段接同一招的下一段（Skill_2_Begin → Skill_2_Loop → Skill_2_End），
 * 最后一段播完按「循环」回到第一段或停住；只有一段的动作返回 null
 */
export function nextInChain<T extends AnimSummary>(
  anims: T[],
  current: T,
  loop: boolean,
): T | null {
  const stem = chainOf(current.name)[0];
  const chain = anims
    .filter((a) => a.duration && chainOf(a.name)[0] === stem)
    .sort((a, b) => chainOf(a.name)[1] - chainOf(b.name)[1]);
  const i = chain.indexOf(current);
  if (chain.length < 2 || i < 0) return null;
  return chain[i + 1] ?? (loop ? chain[0] : null);
}
