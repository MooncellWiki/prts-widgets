import { TORAPPU_ENDPOINT } from "@/utils/consts";

import { roomGlyph } from "./assets";
import { condId, ROOM_ORDER, TARGET_LABELS } from "./consts";
import { parseRichText, plainText, type RtNode } from "./richText";

/* ── 游戏数据（torappu 解包的 gamedata，只列用得到的字段）── */

export interface BuildingBuffData {
  buffId: string;
  buffName: string;
  skillIcon: string;
  sortId: number;
  /** 技能名条的底色（游戏 BuildingBuffDescView 的 _bkgTitle），每个设施一种 */
  buffColor: string;
  roomType: string;
  description: string;
  /** 进驻面板按效率排序用的数值（只有 buffSortData.hasEfficiencySort 的设施才有） */
  efficiency: number;
  /** 作用对象：F_GOLD / F_EVOLVE / PIONEER … */
  targets: string[];
}

export interface BuildingCharData {
  charId: string;
  /** 两个技能槽，每槽是按解锁条件依次替换的技能链 */
  buffChar: {
    buffData: {
      buffId: string;
      cond: { phase: string | number; level: number };
    }[];
  }[];
}

export interface BuildingData {
  rooms: Record<string, { id: string; name: string }>;
  chars: Record<string, BuildingCharData>;
  buffs: Record<string, BuildingBuffData>;
  buffSortData?: Record<
    string,
    {
      hasEfficiencySort?: boolean;
      efficiencyTargetDict?: Record<
        string,
        { targets: string[]; sortId: number }
      >;
    }
  >;
}

export interface CharacterData {
  name: string;
  rarity: string | number;
  profession: string;
}

export interface GamedataConst {
  termDescriptionDict: Record<
    string,
    { termName: string; description: string }
  >;
}

/** Template:BaseSkill/info：编辑写的技能备注（同 模块:BaseSkillInfo），按技能名；__1__ 这种占位换成插入的模板 */
export type NoteData =
  | string
  | {
      text: string;
      insert?: Record<
        string,
        {
          type: string;
          param: { title: string; args: Record<string, string> };
        }
      >;
    };

export interface RawSource {
  building: BuildingData;
  characters: Record<string, CharacterData>;
  consts: GamedataConst;
  notes?: Record<string, NoteData>;
}

/* ── 页面用的数据 ── */

export interface TargetOption {
  /** buffSortData 的键（gold / evolve / pioneer …），也是地址栏里的写法 */
  id: string;
  label: string;
  targets: readonly string[];
  room: string;
}

export interface Room {
  index: number;
  id: string;
  name: string;
  /** 设施线稿的地址 */
  glyph: string;
  /** 亮色主题的设施色：技能名条的底色 */
  color: string;
  /** 暗色主题的设施色：进驻面板的光环色 */
  halo: string;
  /** 作用对象（只有制造站 / 加工站 / 训练室有） */
  targets: TargetOption[];
  /** 这个设施的技能条数 */
  count: number;
}

export interface Char {
  /** 稀有度高的在前、同稀有度按 charId（≈ 实装先后）的次序 */
  index: number;
  id: string;
  name: string;
  /** 1–6 */
  stars: number;
  /** PIONEER … */
  profession: string;
  /** 两个技能槽各自的技能链；只有一槽的干员第二槽是空的 */
  slots: Holding[][];
}

/** 一位干员的一个技能槽里的一级：谁、哪一槽第几级、什么时候解锁 */
export interface Holding {
  char: Char;
  buff: Buff;
  slot: number;
  step: number;
  phase: number;
  level: number;
  /** condId：e0 / e0l30 / e2 */
  cond: string;
}

export interface Buff {
  /** 游戏顺序：设施次序 + sortId */
  index: number;
  id: string;
  name: string;
  room: Room;
  icon: string;
  color: string;
  eff: number;
  targets: readonly string[];
  desc: RtNode[];
  holders: Holding[];
  /** 技能链里的上一级（各持有者的槽里看，去重） */
  prev: Buff[];
  /** 技能链里的下一级，带解锁条件（各持有者的槽里看，按技能去重） */
  next: Holding[];
  note?: RtNode[];
  /** 搜索用：技能名 + 描述，已转小写 */
  haystack: string;
}

export interface Source {
  rooms: Room[];
  buffs: Buff[];
  chars: Char[];
  /** 术语 id → 「名字：解释」 */
  terms: Map<string, string>;
  /** 出现过的解锁条件，按阶段 / 等级排 */
  conds: { id: string; phase: number; level: number }[];
}

const phaseOf = (p: string | number) =>
  typeof p === "number" ? p : Number(p.replace(/^PHASE_/, "")) || 0;
/** TIER_6 → 6；旧数据是 0–5 的数 */
const starsOf = (r: string | number) =>
  typeof r === "number" ? r + 1 : Number(r.replace(/^TIER_/, "")) || 1;

/** 备注 → 结点树：只认 {{术语}}，别的模板只留文字 */
export function parseNote(note: NoteData): RtNode[] {
  if (typeof note === "string") return [{ type: "text", text: note }];
  const out: RtNode[] = [];
  const parts = note.text.split(/__(\d+)__/);
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      if (part) out.push({ type: "text", text: part });
      return;
    }
    const ins = note.insert?.[part];
    const args = ins?.param.args ?? {};
    const text = args["2"] ?? args["1"] ?? "";
    if (ins?.type === "template" && ins.param.title === "术语" && args["1"])
      out.push({
        type: "term",
        key: args["1"],
        children: [{ type: "text", text }],
      });
    else if (text) out.push({ type: "text", text });
  });
  return out;
}

const mostCommon = (values: string[]) => {
  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#565656";
};

/**
 * 游戏数据 → 页面用的数据。
 * 只收 building_data 里有的干员（= 现网「持有干员」里的那些；预备干员、召唤物没有后勤技能）。
 */
export function buildSource({
  building,
  characters,
  consts,
  notes = {},
}: RawSource): Source {
  const terms = new Map(
    Object.entries(consts.termDescriptionDict).map(([id, t]) => [
      id,
      `${t.termName}：${plainText(parseRichText(t.description)).trim()}`,
    ]),
  );

  /* 设施：已知的按游戏次序；新出的（有技能但不在表里）接在后面，光环色用技能名条的底色 */
  const raws = Object.values(building.buffs);
  const known = new Map<string, (typeof ROOM_ORDER)[number]>(
    ROOM_ORDER.map((r) => [r.id, r]),
  );
  const roomIds = [
    ...ROOM_ORDER.map((r) => r.id as string),
    ...new Set(raws.map((b) => b.roomType).filter((id) => !known.has(id))),
  ];
  const rooms: Room[] = [];
  for (const id of roomIds) {
    const mine = raws.filter((b) => b.roomType === id);
    if (mine.length === 0) continue;
    const color = mostCommon(mine.map((b) => b.buffColor.toLowerCase()));
    const dict = building.buffSortData?.[id]?.efficiencyTargetDict ?? {};
    rooms.push({
      index: rooms.length,
      id,
      name: building.rooms[id]?.name ?? id,
      glyph: roomGlyph(id),
      color,
      halo: known.get(id)?.halo ?? color,
      targets: Object.entries(dict)
        .filter(([key]) => key !== "all")
        .sort((a, b) => a[1].sortId - b[1].sortId)
        .map(([key, v]) => ({
          id: key,
          label: TARGET_LABELS[key] ?? key,
          targets: v.targets,
          room: id,
        })),
      count: mine.length,
    });
  }
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const buffs: Buff[] = raws
    .sort(
      (a, b) =>
        roomById.get(a.roomType)!.index - roomById.get(b.roomType)!.index ||
        a.sortId - b.sortId ||
        (a.buffId < b.buffId ? -1 : 1),
    )
    .map((b, index) => {
      const desc = parseRichText(b.description);
      const note = notes[b.buffName];
      return {
        index,
        id: b.buffId,
        name: b.buffName,
        room: roomById.get(b.roomType)!,
        icon: b.skillIcon,
        color: b.buffColor,
        eff: b.efficiency ?? 0,
        targets: b.targets ?? [],
        desc,
        holders: [],
        prev: [],
        next: [],
        note: note ? parseNote(note) : undefined,
        haystack: `${b.buffName}\n${plainText(desc)}`.toLowerCase(),
      };
    });
  const buffById = new Map(buffs.map((b) => [b.id, b]));

  const chars: Char[] = [];
  for (const [id, c] of Object.entries(building.chars)) {
    const info = characters[id];
    if (!info) {
      console.warn("[BaseSkillList] character_table 里没有", id);
      continue;
    }
    chars.push({
      index: 0,
      id,
      name: info.name,
      stars: starsOf(info.rarity),
      profession: info.profession,
      slots: [],
    });
    const char = chars[chars.length - 1];
    char.slots = c.buffChar.map((slot, si) => {
      const chain: Holding[] = [];
      for (const x of slot.buffData) {
        const buff = buffById.get(x.buffId);
        if (!buff) continue;
        const phase = phaseOf(x.cond.phase);
        const level = x.cond.level ?? 1;
        chain.push({
          char,
          buff,
          slot: si,
          step: chain.length,
          phase,
          level,
          cond: condId(phase, level),
        });
      }
      return chain;
    });
  }
  chars.sort((a, b) => b.stars - a.stars || (a.id < b.id ? -1 : 1));
  chars.forEach((c, i) => (c.index = i));

  /* 持有关系与技能链：按干员次序挂上去，持有干员就是稀有度高的在前 */
  for (const char of chars)
    for (const chain of char.slots)
      for (const h of chain) {
        const { buff } = h;
        buff.holders.push(h);
        const prev = chain[h.step - 1];
        const next = chain[h.step + 1];
        if (prev && !buff.prev.includes(prev.buff)) buff.prev.push(prev.buff);
        if (next && !buff.next.some((n) => n.buff === next.buff))
          buff.next.push(next);
      }

  const condMap = new Map<
    string,
    { id: string; phase: number; level: number }
  >();
  for (const b of buffs)
    for (const h of b.holders)
      condMap.set(h.cond, { id: h.cond, phase: h.phase, level: h.level });
  const conds = [...condMap.values()].sort(
    (a, b) => a.phase - b.phase || a.level - b.level,
  );

  return { rooms, buffs, chars, terms, conds };
}

/* ── 取数据 ── */

async function json<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}：${url}`);
  return resp.json();
}

const excel = <T>(name: string) =>
  json<T>(`${TORAPPU_ENDPOINT}/gamedata/latest/excel/${name}.json`);

/** 编辑写的备注：取不到就不显示，不挡整页 */
async function fetchNotes(): Promise<Record<string, NoteData>> {
  try {
    const data = await json<{ info?: Record<string, NoteData> }>(
      `/index.php?${new URLSearchParams({
        title: "Template:BaseSkill/info",
        action: "raw",
        ctype: "application/json",
      })}`,
    );
    return data.info ?? {};
  } catch (error) {
    console.warn("[BaseSkillList] 技能备注读取失败", error);
    return {};
  }
}

/** 游戏数据从 torappu 取最新一版（同 SOExpCalc / 抽卡模拟器），备注从站内取 */
export async function fetchSource(): Promise<Source> {
  const [building, characters, consts, notes] = await Promise.all([
    excel<BuildingData>("building_data"),
    excel<Record<string, CharacterData>>("character_table"),
    excel<GamedataConst>("gamedata_const"),
    fetchNotes(),
  ]);
  return buildSource({ building, characters, consts, notes });
}
