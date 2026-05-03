export interface ItemData {
  name: string;
  description: string;
  usage: string;
  obtainApproach: string[];
  rarity: number;
  category1: string;
  category2: string;
  categories: string[];
  itemId: string;
  sortId: number;
  iconId: string;
  forceWikiFile: boolean;
  darkBackground: boolean;
}

export interface FilterConfig {
  filters: Record<
    string,
    {
      title: string;
      options: string[];
    }
  >;
  groups: {
    title: string;
    filters: string[];
    show: boolean;
  }[];
  states: Record<string, string[]>;
  sortOrder: "id_asc" | "id_desc" | "rarity_asc" | "rarity_desc";
}
