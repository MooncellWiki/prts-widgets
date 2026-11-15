import { resolveStoryScriptUrl } from "../widgets/StoryPlayer/context";

export const EXAMPLE_STORY_PATH = "obt/main/level_main_00-01_beg.txt";

/** url 优先于 path；完整 URL 仅允许 HTTP(S)，沿用播放器的剧情路径解析。 */
export async function loadPageStory(params: URLSearchParams): Promise<string> {
  const url = params.get("url")?.trim();
  const path = params.get("path")?.trim();
  if (!url && !path)
    throw new Error(
      `请在 URL 中提供 path 或 url 参数，例如 ?path=${EXAMPLE_STORY_PATH}`,
    );
  if (url && !/^https?:\/\//i.test(url))
    throw new Error("url 参数必须是完整的 HTTP(S) 地址。");

  const source = resolveStoryScriptUrl(url || path!);
  return await fetchStoryScript(source);
}

/** 正式页与调试工具栏共用同一套 HTTP / 空内容校验。 */
export async function fetchStoryScript(source: string): Promise<string> {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`HTTP ${response.status}：${source}`);
  const script = await response.text();
  if (!script.trim()) throw new Error(`剧情内容为空：${source}`);
  return script;
}
