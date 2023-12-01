export interface Memory {
  elite: string;
  level: string;
  favor: string;
  name: string;
  medal: Medal;
  info: MemoryInfo[];
}

export interface MemoryInfo {
  intro: string;
  link: string;
}

export interface CharMemory {
  char: string;
  charID: string;
  charEID: string;
  rarity: string;
  memories: Memory[];
}

export interface Medal {
  medal: string;
  alias: string;
  desc: string;
}
