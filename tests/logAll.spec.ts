import { describe, expect, it } from "vitest";

import { buildLogAll } from "../src/widgets/StoryPlayer/engine/logAll";
import { parseScript } from "../src/widgets/StoryPlayer/engine/parser";

const run = (source: string | readonly string[]) =>
  buildLogAll(parseScript(source));

describe("buildLogAll", () => {
  it("collects linear dialogue and narration as flat line entries", () => {
    const entries = run(['[name="卢西恩"]你好。', "旁白文本一行。"]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      kind: "line",
      speaker: "卢西恩",
      source: "dialogue",
    });
    expect(entries[0].kind === "line" && entries[0].spans[0]?.text).toBe(
      "你好。",
    );
    expect(entries[1]).toMatchObject({
      kind: "line",
      speaker: "",
      source: "narration",
    });
  });

  it("keeps hidelog stickers and subtitles out of the review list", () => {
    const entries = run([
      '[Sticker(id="a",text="进列表")]',
      '[Sticker(id="b",text="不进列表",hidelog=true)]',
      '[Subtitle(text="也不进",hidelog=true)]',
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind === "line" && entries[0].spans[0]?.text).toBe(
      "进列表",
    );
  });

  it("skips empty dialogue/narration text", () => {
    const entries = run(['[name="卢西恩"]', "", '[name="A"]有内容']);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "line", speaker: "A" });
  });

  it("stamps each line entry with its source lineNumber (1-based, matches runtime)", () => {
    const lines = parseScript([
      '[name="卢西恩"]你好。', // line 1
      "旁白文本一行。", // line 2
      "[delay(time=0.1)]", // line 3 (控制命令，不产生条目)
      '[name="阿米娅"]第三句。', // line 4
    ]);
    const entries = buildLogAll(lines);
    expect(entries).toHaveLength(3);
    expect(entries[0].kind).toBe("line");
    expect(entries[0].kind === "line" && entries[0].lineIndex).toBe(1);
    expect(entries[1].kind === "line" && entries[1].lineIndex).toBe(2);
    expect(entries[2].kind === "line" && entries[2].lineIndex).toBe(4);
  });

  it("uses the last accumulated command line for multiline composite entries", () => {
    const lines = parseScript([
      '[multiline(name="A")]第一段', // line 1
      "[multiline]第二段", // line 2
      "[multiline(end=true)]第三段", // line 3 — flush 点，lineIndex 取这里
    ]);
    const entries = buildLogAll(lines);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind === "line" && entries[0].lineIndex).toBe(3);
    expect(entries[0].kind === "line" && entries[0].spans[0]?.text).toBe(
      "第一段第二段第三段",
    );
  });

  it("stamps lineIndex inside decision branches (per-route copy)", () => {
    const lines = parseScript([
      '[decision(options="A;B", values="1;2")]', // line 1
      '[name="公共"]共享', // line 2
      '[predicate(references="1")]', // line 3
      '[name="A"]分支A', // line 4
      '[predicate(references="2")]', // line 5
      '[name="B"]分支B', // line 6
      "[predicate]", // line 7
    ]);
    const entries = buildLogAll(lines);
    if (entries[0].kind !== "decision") return;
    const decision = entries[0];
    // shared 段的行
    expect(
      decision.shared[0].kind === "line" && decision.shared[0].lineIndex,
    ).toBe(2);
    // 两个分支段各自的行
    expect(
      decision.branches[0].entries[0].kind === "line" &&
        decision.branches[0].entries[0].lineIndex,
    ).toBe(4);
    expect(
      decision.branches[1].entries[0].kind === "line" &&
        decision.branches[1].entries[0].lineIndex,
    ).toBe(6);
    // routes 投影后也保留同样的 lineIndex
    expect(
      decision.routes[0].entries[0].kind === "line" &&
        decision.routes[0].entries[0].lineIndex,
    ).toBe(4);
    expect(
      decision.routes[1].entries[0].kind === "line" &&
        decision.routes[1].entries[0].lineIndex,
    ).toBe(6);
  });

  it("expands a decision into shared + one branch per predicate (matching runtime filtering)", () => {
    const entries = run([
      '[decision(options="选A;选B", values="1;2")]',
      '[name="公共"]共享文本',
      '[predicate(references="1")]',
      '[name="A"]甲分支文本',
      '[predicate(references="2")]',
      '[name="B"]乙分支文本',
      "[predicate]",
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("decision");
    if (entries[0].kind !== "decision") return;

    expect(entries[0].options).toEqual([
      { label: "选A", value: 1 },
      { label: "选B", value: 2 },
    ]);
    // 共享段：decision 后、第一个 predicate 前（runtime 无条件执行）
    expect(entries[0].shared).toHaveLength(1);
    expect(entries[0].shared[0]).toMatchObject({
      kind: "line",
      speaker: "公共",
    });
    // 两个分支段，references 与 runtime decisionReferences 一一对应
    expect(entries[0].branches).toHaveLength(2);
    expect(entries[0].branches[0].references).toEqual([1]);
    expect(entries[0].branches[0].labels).toEqual(["选A"]);
    expect(entries[0].branches[0].entries).toHaveLength(1);
    expect(entries[0].branches[0].entries[0]).toMatchObject({
      kind: "line",
      speaker: "A",
    });
    expect(entries[0].branches[1].references).toEqual([2]);
    expect(entries[0].branches[1].labels).toEqual(["选B"]);
    expect(entries[0].branches[1].entries[0]).toMatchObject({
      kind: "line",
      speaker: "B",
    });
    expect(entries[0].routes).toHaveLength(2);
    expect(entries[0].routes[0].option).toEqual({ label: "选A", value: 1 });
    expect(entries[0].routes[0].entries[0]).toMatchObject({ speaker: "A" });
    expect(entries[0].routes[1].option).toEqual({ label: "选B", value: 2 });
    expect(entries[0].routes[1].entries[0]).toMatchObject({ speaker: "B" });
  });

  it("bare [predicate] ends branch mode so following text returns to top level", () => {
    const entries = run([
      '[decision(options="A;B", values="1;2")]',
      '[predicate(references="1")]',
      '[name="A"]分支内',
      "[predicate]",
      '[name="后"]决策之后',
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe("decision");
    expect(entries[1]).toMatchObject({ kind: "line", speaker: "后" });
  });

  it("predicate with multiple references collects them into one branch segment", () => {
    // 对齐 runtime：predicate(references="1;2") 表示选 1 或 2 的玩家都走这一段
    const entries = run([
      '[decision(options="A;B;C", values="1;2;3")]',
      '[predicate(references="1;2")]',
      '[name="AB"]A和B共享文本',
      '[predicate(references="3")]',
      '[name="C"]C分支文本',
      "[predicate]",
    ]);
    if (entries[0].kind !== "decision") return;
    expect(entries[0].branches).toHaveLength(2);
    expect(entries[0].branches[0].references).toEqual([1, 2]);
    expect(entries[0].branches[0].labels).toEqual(["A", "B"]);
    expect(entries[0].branches[0].entries[0]).toMatchObject({ speaker: "AB" });
    expect(entries[0].branches[1].references).toEqual([3]);
    expect(entries[0].branches[1].labels).toEqual(["C"]);
    expect(entries[0].branches[1].entries[0]).toMatchObject({ speaker: "C" });
    expect(entries[0].routes[0].entries[0]).toMatchObject({ speaker: "AB" });
    expect(entries[0].routes[1].entries[0]).toMatchObject({ speaker: "AB" });
    expect(entries[0].routes[2].entries[0]).toMatchObject({ speaker: "C" });
  });

  it("keeps partial matches in routes and moves an all-options match to the parent flow", () => {
    const entries = run([
      '[decision(options="A;B", values="1;2")]',
      '[predicate(references="1")]',
      '[name="A1"]第一段',
      '[predicate(references="1;2")]',
      '[name="AB"]共同分支段',
      "[predicate]",
    ]);
    if (entries[0].kind !== "decision") return;

    expect(
      entries[0].routes[0].entries.map(
        (entry) => entry.kind === "line" && entry.speaker,
      ),
    ).toEqual(["A1"]);
    expect(entries[0].routes[1].entries).toEqual([]);
    expect(entries[1]).toMatchObject({ kind: "line", speaker: "AB" });
  });

  it("returns to the parent flow when a predicate covers every option", () => {
    const entries = run([
      '[decision(options="第一A;第一B", values="1;2")]',
      '[predicate(references="1;2")]',
      '[name="共同"]第一组选择后的共同文本',
      '[decision(options="第二A;第二B", values="1;2")]',
      '[predicate(references="1;2")]',
      '[name="后续"]第二组选择后的共同文本',
    ]);

    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({ kind: "decision" });
    expect(entries[1]).toMatchObject({ kind: "line", speaker: "共同" });
    expect(entries[2]).toMatchObject({ kind: "decision" });
    expect(entries[3]).toMatchObject({ kind: "line", speaker: "后续" });
    if (entries[0].kind !== "decision" || entries[2].kind !== "decision")
      return;
    expect(entries[0].routes.every((route) => route.entries.length === 0)).toBe(
      true,
    );
    expect(entries[2].routes.every((route) => route.entries.length === 0)).toBe(
      true,
    );
  });

  it("keeps inner convergence in the outer path when another history skipped the inner decision", () => {
    const entries = run([
      '[decision(options="外A;外B", values="1;2")]',
      '[predicate(references="1")]',
      '[decision(options="内X;内Y", values="10;11")]',
      '[predicate(references="10;11")]',
      '[name="内层汇合"]仍然只在外A路径中',
      "[predicate]",
    ]);

    if (entries[0].kind !== "decision") return;
    const outerARoute = entries[0].routes[0].entries;
    expect(outerARoute[0]).toMatchObject({ kind: "decision" });
    const inner = outerARoute[0];
    if (inner.kind !== "decision") return;
    expect(inner.routes[0].entries[0]).toMatchObject({
      kind: "line",
      speaker: "内层汇合",
    });
    expect(inner.routes[1].entries[0]).toMatchObject({
      kind: "line",
      speaker: "内层汇合",
    });
    expect(entries[0].routes[1].entries).toEqual([]);
  });

  it("returns the 07-03 nested decision sequence to the root flow", () => {
    const entries = run([
      '[decision(options="阿米娅;沉默;凯尔希", values="1;2;3")]',
      '[predicate(references="1")]',
      '[name="A"]外层一',
      '[predicate(references="2")]',
      '[name="B"]外层二',
      '[predicate(references="3")]',
      '[name="C"]外层三',
      '[decision(options="计划？", values="1")]',
      '[predicate(references="1")]',
      '[name="阿米娅"]询问哪方面',
      '[decision(options="办法;怎么去;直接问好", values="1;2;3")]',
      '[predicate(references="1;2;3")]',
      '[name="凯尔希"]罗德岛确实有自己的方法',
      '[name="后续"]荒野场景',
    ]);

    expect(entries.at(-2)).toMatchObject({ kind: "line", speaker: "凯尔希" });
    expect(entries.at(-1)).toMatchObject({ kind: "line", speaker: "后续" });
  });

  it("keeps an explicit empty route for an option without a matching predicate", () => {
    const entries = run([
      '[decision(options="A;B", values="1;2")]',
      '[predicate(references="1")]',
      '[name="A"]A分支',
      "[predicate]",
    ]);
    if (entries[0].kind !== "decision") return;

    expect(entries[0].routes[1]).toMatchObject({
      entries: [],
      option: { label: "B", value: 2 },
    });
  });

  it("accumulates multiline text and flushes on end=true", () => {
    const entries = run([
      '[multiline(name="卢西恩")]第一段，',
      '[multiline(name="卢西恩", end=true)]第二段。',
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "line",
      source: "multiline",
      speaker: "卢西恩",
    });
    if (entries[0].kind === "line")
      expect(entries[0].spans.map((s) => s.text).join("")).toBe(
        "第一段，第二段。",
      );
  });

  it("includes sticker and subtitle text with the right source", () => {
    const entries = run([
      '[sticker(id="s1", text="贴纸文本")]',
      '[subtitle(text="字幕文本")]',
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: "line", source: "sticker" });
    expect(entries[1]).toMatchObject({ kind: "line", source: "subtitle" });
  });

  it("preserves color tags as separate spans", () => {
    const entries = run(['[name="A"]<color=#ff0000>红</color>普通']);
    expect(entries).toHaveLength(1);
    if (entries[0].kind !== "line") return;
    expect(entries[0].spans).toEqual([
      { text: "红", color: "#ff0000" },
      { text: "普通", color: null },
    ]);
  });

  it("does not crash on decision without options", () => {
    const entries = run(['[decision(values="1")]', '[name="A"]正文']);
    // 无 options 的 decision 被 runtime warn 并忽略，仅留下对白
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "line", speaker: "A" });
  });

  it("skips predicate without an enclosing decision", () => {
    const entries = run(['[predicate(references="1")]', '[name="A"]正文']);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "line", speaker: "A" });
  });

  it("keeps a decision inside the outer option path that can reach it", () => {
    const entries = run([
      '[decision(options="外A;外B", values="1;2")]',
      '[predicate(references="1")]',
      '[name="外A"]外层分支文本',
      '[decision(options="内X;内Y", values="10;11")]',
      '[predicate(references="10")]',
      '[name="X"]内层分支文本',
      "[predicate]",
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("decision");
    if (entries[0].kind !== "decision") return;

    expect(entries[0].options.map((o) => o.label)).toEqual(["外A", "外B"]);
    expect(entries[0].branches).toHaveLength(1);
    expect(entries[0].branches[0].references).toEqual([1]);
    expect(entries[0].branches[0].entries[0]).toMatchObject({ speaker: "外A" });

    const nested = entries[0].routes[0].entries[1];
    expect(nested?.kind).toBe("decision");
    if (!nested || nested.kind !== "decision") return;
    expect(nested.options.map((o) => o.label)).toEqual(["内X", "内Y"]);
    expect(nested.routes[0].entries[0]).toMatchObject({ speaker: "X" });
    expect(entries[0].routes[1].entries).toEqual([]);
  });
});
