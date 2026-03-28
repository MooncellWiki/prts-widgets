import type {
  CargoCharMemory,
  CharMemory,
  Medal,
  Memory,
  MemoryTime,
} from "./types";

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

export async function getMemoryData() {
  const result: CharMemory[] = [];
  const respMedal = await fetch(
    `/index.php?${new URLSearchParams({
      action: "raw",
      title: "光荣之路/data",
    })}`,
  );
  const jsonMedal = await respMedal.json();
  const respTime = await fetch(
    `/index.php?${new URLSearchParams({
      action: "raw",
      title: "干员密录一览/time",
    })}`,
  );
  const jsonTime = (await respTime.json()) as Record<string, MemoryTime>;
  const medalData = Object.entries(jsonMedal.medal)
    .filter(
      ([key]: [string, any]) =>
        jsonMedal.category.storyMedal.medal.includes(key) ||
        jsonMedal.category.hiddenMedal.medal.includes(key),
    )
    .map(([, value]: [string, any]) => {
      return {
        medal: value.name as string,
        id: value.id as string,
        desc: value.desc as string,
        method: value.method as string,
      };
    }) as Medal[];

  let offset = 0;
  while (offset % 500 === 0) {
    const resp = await fetch(
      `/api.php?${new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "char_memory,chara",
        join_on: "char_memory._pageName=chara._pageName",
        limit: "5000",
        fields:
          "char_memory._pageName=page,elite,level,favor,storySetName,storyIntro,storyTxt,storyIndex,medal,charIndex=charID,eid=charEID,rarity",
      })}`,
    );
    const json: { cargoquery: { title: CargoCharMemory }[] } =
      await resp.json();
    if (json.cargoquery.length === 0) break;
    offset += json.cargoquery.length;

    const temp: Record<string, CharMemory> = {};
    json.cargoquery.sort((a, b) => {
      const i =
        Number.parseInt(a.title.charID) - Number.parseInt(b.title.charID);
      if (i !== 0) return i;
      const e = Number.parseInt(a.title.elite) - Number.parseInt(b.title.elite);
      if (e !== 0) return e;
      const l = Number.parseInt(a.title.level) - Number.parseInt(b.title.level);
      if (l !== 0) return l;
      const f = Number.parseInt(a.title.favor) - Number.parseInt(b.title.favor);
      if (f !== 0) return f;
      return (
        Number.parseInt(a.title.storyIndex) -
        Number.parseInt(b.title.storyIndex)
      );
    });
    for (const ele of json.cargoquery) {
      if (!temp[ele.title.page]) {
        temp[ele.title.page] = {
          char: ele.title.page,
          charID: ele.title.charID,
          charEID: ele.title.charEID,
          rarity: ele.title.rarity,
          memories: [],
        };
      }
      const prev = temp[ele.title.page].memories.at(-1);
      if (prev && eq(prev, ele.title.elite, ele.title.level, ele.title.favor)) {
        prev.info.push({
          intro: ele.title.storyIntro,
          link: ele.title.storyTxt,
        });
      } else {
        temp[ele.title.page].memories.push({
          elite: ele.title.elite,
          favor: ele.title.favor,
          level: ele.title.level,
          name: ele.title.storySetName,
          time: new Date(
            jsonTime[ele.title.page].stories.find(
              (t) => t.story === ele.title.storySetName,
            )!.time * 1000,
          ),
          isNew: false,
          medal:
            medalData.find(
              (e) =>
                e.method ===
                `解锁干员${ele.title.page}的干员密录《${ele.title.storySetName}》`,
            ) ?? medalData.find((e) => e.id === ele.title.medal)!,
          info: [{ intro: ele.title.storyIntro, link: ele.title.storyTxt }],
        });
      }
    }
    result.push(...Object.values(temp));
  }
  return result;
}
