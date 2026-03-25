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
  stageTime: Date;
}

export interface Medal {
  medal: string;
  id: string;
  desc: string;
  method: string;
}

export interface MemoryTime {
  char: string;
  stageTime: number;
  stories: {
    story: string;
    time: number;
  }[];
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
