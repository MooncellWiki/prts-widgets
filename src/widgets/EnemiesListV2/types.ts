export interface EnemyData {
  enemyIndex: string;
  sortId: number;
  name: string;
  enemyLink: string;
  enemyRace: string;
  enemyLevel: string;
  attackType: string;
  damageType: string;
  motion: string;
  endure: string;
  attack: string;
  defence: string;
  moveSpeed: string;
  attackSpeed: string;
  resistance: string;
  ability: string;
}

export interface FilterConfig {
  filters: {
    [field: string]: {
      title: string;
      options: string[];
    };
  };
  groups: {
    title: string;
    filters: string[];
    show: boolean;
  }[];
  states: Record<string, string[]>;
}
