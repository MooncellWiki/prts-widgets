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
  id: string;
  desc: string;
  method: string;
}

export interface CargoMemory {
  page: string;
  elite: string;
  level: string;
  favor: string;
  medal: string;
  storySetName: string;
  storyIntro: string;
  storyTxt: string;
  storyIndex: string;
}
