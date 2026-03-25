import type { CargoMemory, Medal, Memory } from "./types";

function eq(
  memory: Memory,
  elite: string,
  level: string,
  favor: string,
): boolean {
  return (
    memory.elite === elite && memory.level === level && memory.favor === favor
  );
}

function toMemories(
  char: string,
  medalData: Medal[],
  sorted: CargoMemory[],
): Memory[] {
  const result: Memory[] = [];

  for (const item of sorted) {
    const prev = result.at(-1);
    if (prev && eq(prev, item.elite, item.level, item.favor)) {
      prev.info.push({
        intro: item.storyIntro,
        link: item.storyTxt,
      });
    } else {
      result.push({
        elite: item.elite,
        level: item.level,
        favor: item.favor,
        name: item.storySetName,
        time: new Date(0),
        isNew: false,
        medal:
          medalData.find(
            (e) =>
              e.method === `解锁干员${char}的干员密录《${item.storySetName}》`,
          ) ?? medalData.find((e) => e.id === item.medal)!,
        info: [{ intro: item.storyIntro, link: item.storyTxt }],
      });
    }
  }
  return result;
}

export async function getMemories(
  medalData: Medal[],
): Promise<Record<string, Memory[]>> {
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: "char_memory",
      limit: "5000",
      fields:
        "_pageName=page,elite,level,favor,storySetName,storyIntro,storyTxt,storyIndex,medal",
    })}`,
  );
  const json: { cargoquery: { title: CargoMemory }[] } = await resp.json();
  const tmp: Record<string, CargoMemory[]> = {};
  for (const e of json.cargoquery) {
    if (!tmp[e.title.page]) {
      tmp[e.title.page] = [];
    }
    tmp[e.title.page].push(e.title);
  }
  const memoryMap: Record<string, Memory[]> = {};
  for (const [key, memories] of Object.entries(tmp)) {
    memories.sort((a, b) => {
      const e = Number.parseInt(a.elite) - Number.parseInt(b.elite);
      if (e !== 0) return e;
      const l = Number.parseInt(a.level) - Number.parseInt(b.level);
      if (l !== 0) return l;
      const f = Number.parseInt(a.favor) - Number.parseInt(b.favor);
      if (f !== 0) return f;
      return Number.parseInt(a.storyIndex) - Number.parseInt(b.storyIndex);
    });
    memoryMap[key] = toMemories(key, medalData, memories);
  }
  return memoryMap;
}
