import { Medal, Memory } from "./types";

export async function getOnlineDate() {
  const resp = await fetch("/rest.php/v1/page/干员密录一览%2F密录上线时间");
  const content = (await resp.json()).source as string;
  const temp = content
    .split("\n")
    .map((line) => {
      return line.replaceAll(/\s/g, "");
    })
    .filter((line) => {
      return line.match(/\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)/);
    })
    .map((line) => {
      const extract = line.match(
        /\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)/,
      ) as string[];
      return [
        (extract[1].match(/\[\[(.*?)\|(.*?)\]\]/) as string[])[2] as string,
        // 第一密录下标：3
        extract.slice(3, -1).map((str) => {
          return new Date(str);
        }),
      ];
    });

  const result = Object.fromEntries(temp);
  return result;
}

export function getTargetDate(dates: Date[], isLatest: boolean) {
  let latest = dates[0];
  for (const date of dates) {
    if (
      date.toString() !== "Invalid Date" && isLatest
        ? date > latest
        : date < latest
    )
      latest = date;
  }
  return latest;
}

function eq(
  memory: Memory,
  elite: string,
  level: string,
  favor: string,
): boolean {
  return (
    memory.elite == elite && memory.level == level && memory.favor == favor
  );
}

interface CargoMemory {
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
function toMemories(medalData: Medal[], sorted: CargoMemory[]): Memory[] {
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
        medal: medalData.find((e) => e.alias === item.medal)!,
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
  json.cargoquery.forEach((e) => {
    if (!tmp[e.title.page]) {
      tmp[e.title.page] = [];
    }
    tmp[e.title.page].push(e.title);
  });
  const memoryMap: Record<string, Memory[]> = {};
  Object.entries(tmp).forEach(([key, memories]) => {
    memories.sort((a, b) => {
      const e = parseInt(a.elite) - parseInt(b.elite);
      if (e !== 0) return e;
      const l = parseInt(a.level) - parseInt(b.level);
      if (l !== 0) return l;
      const f = parseInt(a.favor) - parseInt(b.favor);
      if (f !== 0) return f;
      return parseInt(a.storyIndex) - parseInt(b.storyIndex);
    });
    memoryMap[key] = toMemories(medalData, memories);
  });
  return memoryMap;
}
