import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  analyzeStoryFlow,
  buildLogAll,
  buildLogDocument,
  projectVisibleEntries,
} from "../src/widgets/StoryPlayer/engine/log/index";
import { parseScript } from "../src/widgets/StoryPlayer/engine/parser";
import { parseRichChars } from "../src/widgets/StoryPlayer/engine/richtext";
import { expandStoryText } from "../src/widgets/StoryPlayer/engine/textVariables";

import { enumerateOracleTraces } from "./helpers/storyOracle";

// oracle 记录原始文本（含 <color> 标签），投影侧是解析后的 span；
// 对比前用同一套富文本解析把两侧规范化成纯文本
const plainText = (raw: string): string =>
  parseRichChars(expandStoryText(raw))
    .map((char) => char.char)
    .join("");

/**
 * 全语料回归：对剧情文本目录下的全部脚本执行 parse → symbolic analyze →
 * document projection → 与独立 runtime oracle 的逐路径对比。
 *
 * 该测试较慢（oracle 枚举全部可达选择路径），单独提供：
 *   pnpm test:story-log
 * 语料默认取仓库同级的 ../torappu/storage/asset/gamedata/latest/story，
 * 放在别处时用 STORY_CORPUS_ROOT 指定；目录不存在时整组跳过。
 */

const CORPUS_ROOT =
  process.env.STORY_CORPUS_ROOT ??
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../torappu/storage/asset/gamedata/latest/story",
  );
const MAX_TRACES_PER_FILE = 2000;

function listStoryFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".txt")) files.push(full);
    }
  };
  walk(root);
  return files.sort((a, b) => a.localeCompare(b));
}

const corpusAvailable = (() => {
  try {
    return statSync(CORPUS_ROOT).isDirectory();
  } catch {
    return false;
  }
})();

describe.skipIf(!corpusAvailable)("story log corpus", () => {
  it.skipIf(!corpusAvailable)(
    "analyzes every story file within the symbolic state budget",
    () => {
      const files = listStoryFiles(CORPUS_ROOT);
      expect(files.length).toBeGreaterThan(5000);
      let peakStateCount = 0;
      const degraded: string[] = [];
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        const flow = analyzeStoryFlow(parseScript(source));
        peakStateCount = Math.max(peakStateCount, flow.stats.peakStateCount);
        if (flow.stats.degraded) degraded.push(file);
        expect(() => buildLogDocument(flow), file).not.toThrow();
      }
      // 状态数在真实语料里始终是个位数（decision 会重置 value/refs 并结算
      // multiline，路径重新汇合）；这里守住规模，别让分析悄悄退化
      expect(peakStateCount).toBeLessThan(50);
      expect(degraded).toEqual([]);
    },
    600_000,
  );

  it.skipIf(!corpusAvailable)(
    "matches the independent runtime oracle on every reachable path",
    () => {
      const files = listStoryFiles(CORPUS_ROOT);
      const compared = new Set<string>();
      for (const file of files) {
        const lines = parseScript(readFileSync(file, "utf8"));
        const flowTraceCount = enumerateOracleTraces(lines, {}, 1);
        if (flowTraceCount[0]!.choices.length === 0) continue; // 无 decision 的文件无需逐路径对比

        compared.add(file);
        const document = buildLogAll(lines);
        const traces = enumerateOracleTraces(lines, {}, MAX_TRACES_PER_FILE);
        expect(traces.length, `${file} path count`).toBeGreaterThan(0);
        for (const trace of traces) {
          const assignment = new Map(
            trace.choices.map((choice) => [
              choice.lineIndex,
              choice.optionIndex,
            ]),
          );
          const projected = projectVisibleEntries(document, assignment).map(
            (entry) =>
              `${entry.lineIndex}|${entry.speaker}|${entry.source}|${entry.spans.map((s) => s.text).join("")}`,
          );
          const oracle = trace.entries.map(
            (entry) =>
              `${entry.lineIndex}|${entry.speaker}|${entry.source}|${plainText(entry.text)}`,
          );
          expect(
            projected,
            `${file} [choices ${trace.choices.map((c) => c.optionIndex).join(",")}]`,
          ).toEqual(oracle);
        }
      }
      expect(compared.size).toBeGreaterThan(300); // 含 decision 的文件应有三四百个
    },
    600_000,
  );
});
