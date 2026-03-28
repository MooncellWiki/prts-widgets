export interface Memory {
  elite: string;
  level: string;
  favor: string;
  name: string;
  medal: Medal;
  time: Date;
  isNew: boolean;
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

export interface MemoryTime {
  stageTime: number;
  stories: {
    story: string;
    time: number;
  }[];
}

export interface CargoCharMemory {
  page: string;
  charID: string;
  charEID: string;
  rarity: string;
  elite: string;
  level: string;
  favor: string;
  medal: string;
  storySetName: string;
  storyIntro: string;
  storyTxt: string;
  storyIndex: string;
}
