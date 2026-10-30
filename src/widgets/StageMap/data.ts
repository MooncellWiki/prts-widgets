import { TORAPPU_ENDPOINT } from "@/utils/consts";

/** torappu 上的解包数据：gamedata/latest 下的路径全小写 */
export const gamedata = (path: string) =>
  new URL(`/gamedata/latest/${path}`, TORAPPU_ENDPOINT);

export async function fetchJson<T>(url: URL): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
  return resp.json();
}

/**
 * 预设装置的名字只在 character_table 里（压缩后 400 多 KB），只有关卡里有装置时才去取，
 * 几份地图共用一次请求
 */
let characterNames: Promise<Record<string, string>> | undefined;
export function fetchCharacterNames() {
  characterNames ??= fetchJson<Record<string, { name: string }>>(
    gamedata("excel/character_table.json"),
  ).then((table) =>
    Object.fromEntries(Object.entries(table).map(([id, c]) => [id, c.name])),
  );
  return characterNames;
}

/** levelId（stage_table 的写法，如 Obt/Main/level_main_01-07）→ torappu 上的路径：全小写 */
const normalize = (id: string) =>
  id
    .trim()
    .replace(/\.json$/i, "")
    .toLowerCase();
export const levelPath = (id: string) => `levels/${normalize(id)}.json`;

/** battle_misc_table.levelScenePairs：levelId → 实际读的那份关卡文件的 levelId（键已转小写） */
export function scenePairsOf(table: {
  levelScenePairs: Record<string, { levelId: string }>;
}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(table.levelScenePairs).map(([k, v]) => [
      normalize(k),
      v.levelId,
    ]),
  );
}

let scenePairs: Promise<Record<string, string>> | undefined;
function fetchScenePairs() {
  scenePairs ??= fetchJson<Parameters<typeof scenePairsOf>[0]>(
    gamedata("battle/battle_misc_table.json"),
  ).then(scenePairsOf);
  return scenePairs;
}

/**
 * 取关卡文件。ResourceRouter.GetLevelDataPath 0x8F3420：levelScenePairs 里有这一关的，读它指向的那份
 * （easy_ 关卡读同号 main_ 的文件，难度由符文区分）。表和关卡文件同时取，表里指向别处时再取一次。
 * 取不到返回 null：新活动的关卡不在当前资源版本里（服务端只下发开放中和已常驻的活动的关卡）
 */
export async function fetchLevel<T>(levelId: string): Promise<T | null> {
  if (!levelId) return null;
  const direct = fetchJson<T>(gamedata(levelPath(levelId)));
  // 表取不到不影响直接读
  const pairs = await fetchScenePairs().catch(
    (error): Record<string, string> => {
      console.error("[StageMap] battle_misc_table 读取失败", error);
      return {};
    },
  );
  const target = pairs[normalize(levelId)];
  const level =
    target && normalize(target) !== normalize(levelId)
      ? fetchJson<T>(gamedata(levelPath(target)))
      : direct;
  // 两份都在飞时，不用的那份出错别冒成未处理的 rejection
  direct.catch(() => {});
  return level.catch((error) => {
    console.error("[StageMap] 关卡数据读取失败", levelId, error);
    return null;
  });
}
