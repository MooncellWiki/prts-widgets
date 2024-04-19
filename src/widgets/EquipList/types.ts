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
