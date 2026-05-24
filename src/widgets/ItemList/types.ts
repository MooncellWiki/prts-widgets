export interface ItemData {
  name: string;
  description: string;
  descriptionHtml: string;
  usage: string;
  usageHtml: string;
  obtainApproach: string[];
  rarity: number;
  category1: string;
  category2: string;
  category3: string;
  categories: string[];
  itemId: string;
  sortId: number;
  iconId: string;
  filename: string;
  darkBackground: boolean;
  imgSrc: string;
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
