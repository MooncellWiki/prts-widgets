import { convertFeature } from "./feature";

import type { Rarity } from "@mooncellwiki/prts-design-vue";

const getLast = (str: string) => {
  if (str.includes("→")) {
    const arr = str.split("→");
    return Number.parseInt(arr.at(-1)!);
  }
  return Number.parseInt(str);
};

export class Char {
  zh: string;
  profession: string;
  rarity: number;
  /** 星级 1–6（rarity 从 0 起） */
  stars: Rarity;
  logo: string;
  birthPlace: string;
  race: string[];
  en: string;
  ja: string;
  id: string;
  /** 游戏内 ID（char_002_amiya），取 torappu 资源用；模板没输出时为空 */
  charId: string;
  hp: number;
  atk: number;
  def: number;
  res: number;
  reDeploy: string;
  cost: number;
  block: number;
  interval: string;
  sex: string;
  position: string;
  tag: string[];
  obtainMethod: string[];
  potential: { type: string; value: number }[];
  trust: number[];
  phy: string;
  flex: string;
  tolerance: string;
  plan: string;
  skill: string;
  adapt: string;
  sortId: number;
  subProfession: string;
  /** 模板输出的特性 HTML 原文 */
  feature: string;
  /** 换成设计系统写法的特性 HTML（.ak-rt-kw / .ak-term），见 feature.ts */
  featureHtml: string;
  /** 搜索用的纯文本：不含术语提示的正文 */
  plainFeature: string;
  force: string[] = [];
  constructor(ele: HTMLDivElement) {
    const d = ele.dataset;
    // MediaWiki 1.43 的 Sanitizer 会丢弃含下划线的 data-* 属性，
    // 模板改用 data-birth-place 等连字符形式（dataset 中为驼峰），旧名仅作兼容
    this.zh = d.zh!;
    this.profession = d.profession!;
    this.rarity = Number.parseInt(d.rarity!);
    this.stars = (this.rarity + 1) as Rarity;
    this.logo = d.logo || "";
    this.birthPlace = d.birthPlace || d.birth_place || "";
    if (d.nation) this.force.push(d.nation);
    if (d.group) this.force.push(d.group);
    if (d.team) this.force.push(d.team);

    this.race = (d.race || "").split("/");
    this.en = d.en || "";
    this.ja = d.ja || "";
    this.id = d.id || "";
    this.charId = d.charId || "";
    this.hp = Number.parseInt(d.hp!);
    this.atk = Number.parseInt(d.atk!);
    this.def = Number.parseInt(d.def!);
    this.res = Number.parseInt(d.res!);
    this.reDeploy = d.reDeploy || d.re_deploy || "";
    this.cost = getLast(d.cost!);
    this.block = getLast(d.block!);
    this.interval = d.interval!;
    this.sex = d.sex!;
    this.position = d.position!;
    this.tag = d.tag?.split(" ") || [];
    this.obtainMethod = (d.obtainMethod || d.obtain_method)?.split(", ") || [];

    this.potential = [];
    const [types, values] =
      d.potential?.split("`").map((v) => v.split(",")) || [];
    if (types && values) {
      for (const [i, t] of types.entries()) {
        this.potential.push({ type: t, value: Number.parseInt(values[i]) });
      }
    }
    this.trust =
      d.trust?.split(",").map((v) => (v ? Number.parseInt(v) : 0)) || [];
    this.phy = d.phy || "";
    this.flex = d.flex || "";
    this.tolerance = d.tolerance || "";
    this.plan = d.plan || "";
    this.skill = d.skill || "";
    this.adapt = d.adapt || "";
    this.sortId = Number.parseInt(d.sortid!);
    this.subProfession = d.subprofession!;
    this.feature = ele.innerHTML || "";
    this.featureHtml = convertFeature(ele);
    this.plainFeature = "";
    if (ele.innerHTML) {
      try {
        const dom = document.createElement("div");
        dom.innerHTML = ele.innerHTML;
        for (const e of Array.from(dom.querySelectorAll(".mc-tooltips"))) {
          if (e.children[1]) e.children[1].remove();
        }
        this.plainFeature = dom.textContent!;
      } catch {
        //
      }
    }
  }
}
export type CheckboxOption = string | { label: string; value: string[] };
export interface Filter {
  title: string;
  cbt: CheckboxOption[];
  both: boolean;
  field: string;
}
export interface FilterGroup {
  title: string;
  filter: Filter[];
}
