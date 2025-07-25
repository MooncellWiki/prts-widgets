import type { SelectGroupOption } from "naive-ui";

export interface SelectionConfig {
  title: string;
  options: SelectGroupOption[];
}

export interface Char {
  name: string;
  nameEN: string;
  nameJP: string;
  type: string;
  subtype: string;
  rarity: string | number;
  id: number;
}

export interface CharEquips {
  char: Char;
  equips: DOMStringMap[];
}

export interface CargoEquip {
  opt: string;
  name: string;
  type: string;
  color: string;
  hp: string;
  atk: string;
  def: string;
  res: string;
  time: string;
  block: string;
  cost: string;
  atkspd: string;
  other: string;
  traitadd: string;
  trait: string;
  talent2: string;
  talent3: string;
  lv: string;
  mat: string;
  mat2: string;
  mat3: string;
  mission1: string;
  mission2: string;
  mission2Operation: string;
  cond: string;
  cond2: string;
  cond3: string;
}

export interface EquipRow {
  name: string;
  type: string;
  operator: string;
  oprarity: string | number;
  opid: number;
  data: DOMStringMap;
}

export interface EquipTime {
  time: number;
  equips: {
    char: string;
    name: string;
  }[];
}
