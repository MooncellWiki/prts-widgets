export interface Memory {
  elite: string;
  level: string;
  favor: string;
  name: string;
  medal: string;
  info: MemoryInfo[];
}

export interface MemoryInfo {
  intro: string;
  link: string;
}

export interface CharMemory {
  char: string;
  charEID: string;
  rarity: string;
  memories: Memory[];
}
