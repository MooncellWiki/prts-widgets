import { describe, expect, it } from "vitest";

import {
  ConditionStore,
  TRUE_CONDITION,
} from "../src/widgets/StoryPlayer/engine/log/condition";
import {
  analyzeStoryFlow,
  buildLogAll,
  buildLogDocument,
  collectAllEntries,
  formatConditionLabel,
  projectVisibleEntries,
} from "../src/widgets/StoryPlayer/engine/log/index";
import { parseScript } from "../src/widgets/StoryPlayer/engine/parser";

import { enumerateOracleTraces } from "./helpers/storyOracle";

import type {
  LogBlock,
  LogDocument,
} from "../src/widgets/StoryPlayer/engine/log/types";

const run = (source: string | readonly string[]) =>
  buildLogAll(parseScript(source));

const assignmentOf = (pairs: [number, number][]) => new Map(pairs);

const findConditional = (
  blocks: readonly LogBlock[],
  labelContains: string,
  document: LogDocument,
): Extract<LogBlock, { kind: "conditional" }> | undefined => {
  for (const block of blocks) {
    if (block.kind !== "conditional") continue;
    const label = formatConditionLabel(
      document.conditions.describe(block.audience),
      document.decisions,
    );
    if (label.includes(labelContains)) return block;
    const nested = findConditional(block.blocks, labelContains, document);
    if (nested) return nested;
  }
  return undefined;
};

describe("buildLogAll（线性内容）", () => {
  it("collects linear dialogue and narration as flat line entries", () => {
    const document = run(['[name="卢西恩"]你好。', "旁白文本一行。"]);
    expect(document.blocks).toHaveLength(1);
    const block = document.blocks[0]!;
    expect(block.kind).toBe("lines");
    if (block.kind !== "lines") return;
    expect(block.audience).toBe(TRUE_CONDITION);
    expect(block.entries[0]).toMatchObject({
      lineIndex: 1,
      speaker: "卢西恩",
      source: "dialogue",
    });
    expect(block.entries[1]).toMatchObject({
      lineIndex: 2,
      speaker: "",
      source: "narration",
    });
  });

  it("keeps hidelog stickers and subtitles out of the document", () => {
    const document = run([
      '[Sticker(id="a",text="进列表")]',
      '[Sticker(id="b",text="不进列表",hidelog=true)]',
      '[Subtitle(text="也不进",hidelog=true)]',
    ]);
    const entries = projectVisibleEntries(document, new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0]!.spans[0]?.text).toBe("进列表");
  });

  it("skips empty dialogue/narration text", () => {
    const document = run(['[name="卢西恩"]', "", '[name="A"]有内容']);
    expect(projectVisibleEntries(document, new Map())).toHaveLength(1);
  });

  it("stamps each line entry with its source lineNumber (1-based, matches runtime)", () => {
    const document = run([
      '[name="卢西恩"]你好。', // line 1
      "旁白文本一行。", // line 2
      "[delay(time=0.1)]", // line 3 控制命令，不产生条目
      '[name="阿米娅"]第三句。', // line 4
    ]);
    expect(
      projectVisibleEntries(document, new Map()).map(
        (entry) => entry.lineIndex,
      ),
    ).toEqual([1, 2, 4]);
  });

  it("uses the last accumulated command line for multiline composite entries", () => {
    const document = run([
      '[multiline(name="A")]第一段', // line 1
      "[multiline]第二段", // line 2
      "[multiline(end=true)]第三段", // line 3 — flush 点
    ]);
    const entries = projectVisibleEntries(document, new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ lineIndex: 3, source: "multiline" });
    expect(entries[0]!.spans.map((s) => s.text).join("")).toBe(
      "第一段第二段第三段",
    );
  });

  it("preserves color tags as separate spans", () => {
    const document = run(['[name="A"]<color=#ff0000>红</color>普通']);
    const entries = projectVisibleEntries(document, new Map());
    expect(entries[0]!.spans).toEqual([
      { text: "红", color: "#ff0000" },
      { text: "普通", color: null },
    ]);
  });

  it("includes sticker and subtitle text with the right source", () => {
    const document = run([
      '[sticker(id="s1", text="贴纸文本")]',
      '[subtitle(text="字幕文本")]',
    ]);
    const entries = projectVisibleEntries(document, new Map());
    expect(entries.map((e) => e.source)).toEqual(["sticker", "subtitle"]);
  });

  it("records dialog-sentinel commands carrying content as dialogue", () => {
    // `[imagegroup=..]文本` 落到 dialog 哨兵命令；runtime 中带 content 时
    // 与对白同样显示并重置 multiline
    const document = run(["[imagegroup=2]画外文本"]);
    const entries = projectVisibleEntries(document, new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: "dialogue", lineIndex: 1 });
  });
});

describe("buildLogAll（decision / predicate 语义）", () => {
  it("expands a decision into a choice block plus per-option conditional blocks", () => {
    const document = run([
      '[decision(options="选A;选B", values="1;2")]', // line 1
      '[name="公共"]共享文本', // line 2 — audience TRUE
      '[predicate(references="1")]', // line 3
      '[name="A"]甲分支文本', // line 4
      '[predicate(references="2")]', // line 5
      '[name="B"]乙分支文本', // line 6
      "[predicate]", // line 7
      '[name="后"]决策之后', // line 8
    ]);

    expect(document.blocks.map((b) => b.kind)).toEqual([
      "choice",
      "lines",
      "conditional",
      "conditional",
      "lines",
    ]);

    const choice = document.blocks[0]!;
    expect(choice.kind).toBe("choice");
    if (choice.kind !== "choice") return;
    expect(choice.options.map((o) => o.label)).toEqual(["选A", "选B"]);
    expect(choice.audience).toBe(TRUE_CONDITION);
    expect(choice.inert).toBe(false);

    const branchA = findConditional(document.blocks, "「选A」", document);
    const branchB = findConditional(document.blocks, "「选B」", document);
    expect(branchA?.blocks).toHaveLength(1);
    expect(branchB?.blocks).toHaveLength(1);
    if (branchA?.blocks[0]?.kind !== "lines") return;
    expect(branchA.blocks[0].entries[0]).toMatchObject({
      lineIndex: 4,
      speaker: "A",
    });
    if (branchB?.blocks[0]?.kind !== "lines") return;
    expect(branchB.blocks[0].entries[0]).toMatchObject({
      lineIndex: 6,
      speaker: "B",
    });
  });

  it("expands variable placeholders in decision labels with the playback variables", () => {
    // 与 runtime 的 translateText 同源：播放时按钮显示展开后的文本，
    // Log All 的选项行与条件标签不能停留在字面占位符
    const document = buildLogAll(
      parseScript([
        '[decision(options="跟{@speaker}走;独自行动", values="1;2")]', // line 1
        '[predicate(references="1")]', // line 2
        '[name="A"]分支A', // line 3
        '[predicate(references="2")]', // line 4
        '[name="B"]分支B', // line 5
        "[predicate]", // line 6
      ]),
      { speaker: "Amiya" },
    );

    const choice = document.blocks[0]!;
    expect(choice.kind).toBe("choice");
    if (choice.kind !== "choice") return;
    expect(choice.options.map((option) => option.label)).toEqual([
      "跟Amiya走",
      "独自行动",
    ]);
    expect(
      findConditional(document.blocks, "「跟Amiya走」", document),
    ).toBeDefined();
    expect(
      findConditional(document.blocks, "「独自行动」", document),
    ).toBeDefined();
  });

  it("projects each option's visible sequence for path filtering", () => {
    const document = run([
      '[decision(options="A;B", values="1;2")]',
      '[name="公共"]共享',
      '[predicate(references="1")]',
      '[name="A"]分支A',
      '[predicate(references="2")]',
      '[name="B"]分支B',
      "[predicate]",
      '[name="后"]之后',
    ]);
    const visibleA = projectVisibleEntries(
      document,
      assignmentOf([[1, 0]]),
    ).map((e) => e.speaker);
    const visibleB = projectVisibleEntries(
      document,
      assignmentOf([[1, 1]]),
    ).map((e) => e.speaker);
    expect(visibleA).toEqual(["公共", "A", "后"]);
    expect(visibleB).toEqual(["公共", "B", "后"]);
  });

  it("merges a multi-reference predicate into one conditional block labelled with both options", () => {
    const document = run([
      '[decision(options="A;B;C", values="1;2;3")]', // line 1
      '[predicate(references="1;2")]', // line 2
      '[name="AB"]A和B共享文本', // line 3
      '[predicate(references="3")]', // line 4
      '[name="C"]C分支文本', // line 5
      "[predicate]",
    ]);
    expect(
      findConditional(document.blocks, "「A / B」", document),
    ).toBeDefined();
    expect(findConditional(document.blocks, "「C」", document)).toBeDefined();
    // 选 C 的玩家看不到 AB 段
    expect(
      projectVisibleEntries(document, assignmentOf([[1, 2]])).map(
        (e) => e.speaker,
      ),
    ).toEqual(["C"]);
  });

  it("treats an all-options convergence as common content (audience TRUE)", () => {
    const document = run([
      '[decision(options="A;B", values="1;2")]', // line 1
      '[predicate(references="1")]', // line 2
      '[name="A"]A1', // line 3
      '[predicate(references="1;2")]', // line 4
      '[name="AB"]共同分支段', // line 5
      "[predicate]",
    ]);
    expect(document.blocks.map((b) => b.kind)).toEqual([
      "choice",
      "conditional",
      "lines",
    ]);
    expect(
      projectVisibleEntries(document, assignmentOf([[1, 1]])).map(
        (e) => e.speaker,
      ),
    ).toEqual(["AB"]);
  });

  it("bare [predicate] ends branch mode so following text returns to top level", () => {
    const document = run([
      '[decision(options="A;B", values="1;2")]',
      '[predicate(references="1")]',
      '[name="A"]分支内',
      "[predicate]",
      '[name="后"]决策之后',
    ]);
    const last = document.blocks.at(-1);
    expect(last?.kind).toBe("lines");
    if (last?.kind !== "lines") return;
    expect(last.audience).toBe(TRUE_CONDITION);
    expect(last.entries.map((e) => e.lineIndex)).toEqual([5]);
  });

  it("keeps the 07-03 nested decision sequence converging to the root flow", () => {
    const document = run([
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

    // 末尾两行是全路线共同内容（覆盖 runtime 里被闸门挡住又放行的怪癖路径）
    const last = document.blocks.at(-1);
    expect(last?.kind).toBe("lines");
    if (last?.kind !== "lines") return;
    expect(last.audience).toBe(TRUE_CONDITION);
    expect(last.entries.map((e) => e.speaker)).toEqual(["凯尔希", "后续"]);
  });

  it("attaches predicates to the outer decision when the inner decision was gate-skipped", () => {
    // act3fun_03_end 形状：外层选项 1 的分支里出现内层 decision（values=4），
    // 随后的 predicate 指回外层的 2/3。选 2/3 的玩家从未执行内层 decision。
    const document = run([
      '[decision(options="外1;外2;外3", values="1;2;3")]', // line 1
      '[predicate(references="1")]', // line 2
      '[decision(options="内", values="4")]', // line 3
      '[predicate(references="4")]', // line 4
      '[name="内层"]只有选外1的人看得到', // line 5
      '[predicate(references="2")]', // line 6
      '[name="外2专属"]选外2才看得到', // line 7
      '[predicate(references="3")]', // line 8
      '[name="外3专属"]选外3才看得到', // line 9
    ]);

    // 每条路径都能投影出全部可见文本（旧实现会把外2/外3 段挂到投影不出
    // 它们的内层 decision 下，文本从面板消失）
    const visible = (optionIndex: number) =>
      projectVisibleEntries(document, assignmentOf([[1, optionIndex]])).map(
        (e) => e.speaker,
      );
    expect(visible(0)).toEqual(["内层"]);
    expect(visible(1)).toEqual(["外2专属"]);
    expect(visible(2)).toEqual(["外3专属"]);

    // 外2 的条件区块存在且标签可读
    expect(findConditional(document.blocks, "外2", document)).toBeDefined();
  });

  it("keeps inner decision content nested under the outer option path", () => {
    const document = run([
      '[decision(options="外A;外B", values="1;2")]',
      '[predicate(references="1")]',
      '[name="外A"]外层分支文本',
      '[decision(options="内X;内Y", values="10;11")]',
      '[predicate(references="10")]',
      '[name="X"]内层分支文本',
      "[predicate]",
    ]);
    expect(
      projectVisibleEntries(
        document,
        assignmentOf([
          [1, 0],
          [4, 0],
        ]),
      ).map((e) => e.speaker),
    ).toEqual(["外A", "X"]);
    // 选 内Y（optionIndex 1）时看不到 X 的文本
    expect(
      projectVisibleEntries(
        document,
        assignmentOf([
          [1, 0],
          [4, 1],
        ]),
      ).map((e) => e.speaker),
    ).toEqual(["外A"]);
    // 选 外B 的玩家根本不会执行内层 decision
    expect(
      projectVisibleEntries(document, assignmentOf([[1, 1]])).map(
        (e) => e.speaker,
      ),
    ).toEqual([]);
  });

  it("does not cross-wire identical numeric values between different decisions", () => {
    // 两个 decision 都用 value=1/2；路径身份是 (decisionId, optionIndex)。
    // 注意第二个 decision 只对通过 predicate refs=2 的玩家（选了甲2）执行。
    const document = run([
      '[decision(options="甲1;甲2", values="1;2")]', // line 1
      '[predicate(references="1")]',
      '[name="甲"]甲一',
      '[predicate(references="2")]',
      '[name="乙"]甲二',
      '[decision(options="乙1;乙2", values="1;2")]', // line 6
      '[predicate(references="1")]',
      '[name="丙"]乙一',
      '[predicate(references="2")]',
      '[name="丁"]乙二',
      "[predicate]",
    ]);
    // 甲1 玩家：refs=2 挡住第二个 decision（不重置 value=1），
    // 随后的 predicate refs=[1] 又放行 value=1 → 看得到「乙一」段。
    // 这正是单组可变 value 的 runtime 怪癖，分析器必须原样复刻
    expect(
      projectVisibleEntries(document, assignmentOf([[1, 0]])).map(
        (e) => e.speaker,
      ),
    ).toEqual(["甲", "丙"]);
    // 甲2 玩家执行第二个 decision：乙1 与 甲1 的 value 同为 1，但不串线
    expect(
      projectVisibleEntries(
        document,
        assignmentOf([
          [1, 1],
          [6, 0],
        ]),
      ).map((e) => e.speaker),
    ).toEqual(["乙", "丙"]);
    expect(
      projectVisibleEntries(
        document,
        assignmentOf([
          [1, 1],
          [6, 1],
        ]),
      ).map((e) => e.speaker),
    ).toEqual(["乙", "丁"]);
  });

  it("marks single-option and fully-converged decisions as inert", () => {
    const document = run([
      '[decision(options="继续", values="1")]', // line 1 单选项
      '[name="A"]选择前',
      '[decision(options="X;Y", values="1;2")]', // line 3 全覆盖汇合
      '[predicate(references="1;2")]',
      '[name="B"]汇合后',
      '[decision(options="P;Q", values="1;2")]', // line 6 有实际分叉
      '[predicate(references="1")]',
      '[name="P段"]P',
      '[predicate(references="2")]',
      '[name="Q段"]Q',
      "[predicate]",
    ]);
    const choices = document.blocks.filter(
      (b): b is Extract<LogBlock, { kind: "choice" }> => b.kind === "choice",
    );
    expect(choices.map((c) => c.lineIndex)).toEqual([1, 3, 6]);
    expect(choices.map((c) => c.inert)).toEqual([true, true, false]);
  });

  it("keeps conditions minimal through chained convergences so labels stay readable", () => {
    // 链式 2 项 decision、每次选择后全覆盖汇合：不做增量投影时，
    // 后段文本的 audience 会按 2^n 个前缀组合增长（DNF 超过上限后
    // 标签退化为「部分选择路线」）。每行合并后按可达域投影，
    // 汇合即归一，条件只剩真正区分可见性的那个 decision。
    const script: string[] = [];
    for (let round = 0; round < 10; round += 1) {
      script.push(
        `[decision(options="甲${round};乙${round}", values="1;2")]`,
        '[predicate(references="1;2")]',
        `[name="汇${round}"]汇合文本`,
      );
    }
    script.push('[predicate(references="1")]', '[name="尾"]尾分支');

    const document = run(script);
    const tail = findConditional(document.blocks, "甲9", document);
    expect(tail).toBeDefined();
    const label = tail
      ? formatConditionLabel(
          document.conditions.describe(tail.audience),
          document.decisions,
        )
      : "";
    expect(label).toBe("选择「甲9」");
  });

  it("resets runtime state for an invalid decision without emitting a choice", () => {
    // options 参数缺失：runtime 先重置 value/references 再 warn，不产生选择。
    // 只有通过 refs=1 闸门的玩家（选 A）会执行这次重置并看到后续文本；
    // 选 B 的玩家被 refs=1 挡住，保持旧状态继续被闸门过滤。
    const document = run([
      '[decision(options="A;B", values="1;2")]',
      '[predicate(references="1")]',
      '[decision(values="9")]', // line 3 无效 decision
      '[name="X"]重置后可见',
    ]);
    expect(document.blocks.filter((b) => b.kind === "choice")).toHaveLength(1);
    expect(
      projectVisibleEntries(document, assignmentOf([[1, 0]])).map(
        (e) => e.speaker,
      ),
    ).toEqual(["X"]);
    expect(
      projectVisibleEntries(document, assignmentOf([[1, 1]])).map(
        (e) => e.speaker,
      ),
    ).toEqual([]);
  });

  it("falls back missing values to 0 (native _GetOptionValue out-of-range)", () => {
    // 原生 DecisionPanel._GetOptionValue 越界返回 0（并打
    // `Decision value index out of range`），0 是「未选择」值，闸门恒放行
    const document = run([
      '[decision(options="A;B;C", values="7")]', // 只有 A 有 value
      '[predicate(references="7")]',
      '[name="A7"]A',
      '[predicate(references="2")]',
      '[name="B2"]B', // B 的 value 落到 0
      '[predicate(references="3")]',
      '[name="C3"]C',
      "[predicate]",
    ]);
    // 选 A：value=7 只放行第一段
    expect(
      projectVisibleEntries(document, assignmentOf([[1, 0]])).map(
        (e) => e.speaker,
      ),
    ).toEqual(["A7"]);
    // 选 B/C：value=0，闸门全开，后面每一段都看得到
    expect(
      projectVisibleEntries(document, assignmentOf([[1, 1]])).map(
        (e) => e.speaker,
      ),
    ).toEqual(["A7", "B2", "C3"]);
    expect(
      projectVisibleEntries(document, assignmentOf([[1, 2]])).map(
        (e) => e.speaker,
      ),
    ).toEqual(["A7", "B2", "C3"]);
  });

  it("keeps the story_ghost_2_1 shape (4 options / 3 values) on every route", () => {
    // 真实语料 obt/memory/story_ghost_2_1.txt:643 的形状：第 4 个选项没有
    // 显式 value。取 index+1=4 会被 refs=1;2;3 挡掉整条尾巴；取 0 才与原生
    // 一致——所有选项都看得到后续内容，尾段应是「全部路线」。
    const document = run([
      '[decision(options="甲;乙;丙;丁", values="1;2;3")]', // line 1
      '[predicate(references="1;2;3")]', // line 2
      '[name="尾"]选完之后的剧情', // line 3
    ]);
    const tail = document.blocks.at(-1);
    expect(tail?.kind).toBe("lines");
    if (tail?.kind !== "lines") return;
    expect(tail.audience).toBe(TRUE_CONDITION);
    for (let optionIndex = 0; optionIndex < 4; optionIndex += 1)
      expect(
        projectVisibleEntries(document, assignmentOf([[1, optionIndex]])).map(
          (e) => e.speaker,
        ),
        `option ${optionIndex}`,
      ).toEqual(["尾"]);
  });

  it("ends the accumulation on an empty dialogue line (runtime resetMultiline)", () => {
    // runtime 的 resetMultiline() 在空文本判断之前，空对白同样结束累积
    const document = run([
      '[multiline(name="A")]前半段', // line 1
      '[name="A"]', // line 2 空对白
      '[multiline(name="A")]后半段', // line 3
      '[multiline(name="A", end=true)]收尾', // line 4
    ]);
    expect(
      projectVisibleEntries(document, new Map()).map((entry) =>
        entry.spans.map((span) => span.text).join(""),
      ),
    ).toEqual(["前半段", "后半段收尾"]);
  });

  it("keeps sticker runs out of the dialogue multiline buffer", () => {
    // main_13-19_beg 的形状：对白 multiline 之后紧跟一串 multi 贴纸。
    // 共用一个缓冲会把两者粘成一条并把说话人挂到贴纸文本上；原生 reader
    // mode 在 sticker 处会 _TryEndMultilineMode() 并单独加一条空名字的 cell。
    const document = run([
      '[multiline(name="赫德雷")]借你的怀表一用。', // line 1
      "[dialog]", // line 2 空 content：runtime 不重置累积
      '[Sticker(id="st1", multi = true, text="怀表在倒转。")]', // line 3
      '[Sticker(id="st1", multi = true, text="呢喃填满了脑海。")]', // line 4
      '[name="赫德雷"]它确实吵闹。', // line 5
    ]);
    expect(
      projectVisibleEntries(document, new Map()).map((entry) => [
        entry.speaker,
        entry.source,
        entry.spans.map((span) => span.text).join(""),
      ]),
    ).toEqual([
      ["赫德雷", "multiline", "借你的怀表一用。"],
      ["", "sticker", "怀表在倒转。呢喃填满了脑海。"],
      ["赫德雷", "dialogue", "它确实吵闹。"],
    ]);
  });

  it("degrades to unconditional text instead of throwing on state explosion", () => {
    // 上限压到 2 制造塌缩：B 线在 line 5 的 decision 处被闸门挡住，塌缩
    // 时它还挂着未结算的 multiline —— 这段文本必须先落盘再塌缩。
    const script = [
      '[decision(options="A;B", values="1;2")]', // line 1
      '[predicate(references="2")]', // line 2
      '[multiline(name="乙")]乙线累积', // line 3 只有 B 执行
      '[predicate(references="1")]', // line 4
      '[decision(options="C;D", values="3;4")]', // line 5 A 分裂、B 被挡住
      '[name="后"]塌缩之后的文本', // line 6
    ];

    const flow = analyzeStoryFlow(parseScript(script), {}, { maxStates: 2 });
    expect(flow.stats.degraded).toBe(true);

    const document = buildLogDocument(flow);
    expect(document.degraded).toBe(true);
    // 文本一条都不能丢
    expect(
      collectAllEntries(document).map((entry) =>
        entry.spans.map((span) => span.text).join(""),
      ),
    ).toEqual(["乙线累积", "塌缩之后的文本"]);
    // 塌缩之后的内容不再区分选择路线
    const tail = document.blocks.at(-1);
    expect(tail?.kind).toBe("lines");
    expect(tail?.audience).toBe(TRUE_CONDITION);
  });

  it("keeps multiline accumulators per path when gated", () => {
    // multiline 片段只在选 A 的路径全部通过闸门并在 end=true 时 flush；
    // 选 B 的路径看不到
    const document = run([
      '[decision(options="A;B", values="1;2")]',
      '[predicate(references="1")]',
      '[multiline(name="甲")]第一行',
      '[multiline(name="甲", end=true)]第二行',
      '[name="后"]收尾',
    ]);
    const visibleA = projectVisibleEntries(document, assignmentOf([[1, 0]]));
    const visibleB = projectVisibleEntries(document, assignmentOf([[1, 1]]));
    expect(visibleA.map((e) => e.source)).toEqual(["multiline", "dialogue"]);
    expect(visibleA[0]!.spans.map((s) => s.text).join("")).toBe("第一行第二行");
    // 选 B 的玩家整个尾部都被 refs=1 挡住
    expect(visibleB).toEqual([]);
  });
});

describe("ConditionStore", () => {
  it("absorbs A ∨ (A ∧ B) into A", () => {
    const store = new ConditionStore();
    const a = store.choice(1, 0);
    const b = store.choice(2, 0);
    const aAndB = store.and(a, b);
    expect(store.or([a, aAndB])).toBe(a);
    expect(store.or([aAndB, a])).toBe(a);
  });

  it("flattens nested or nodes and dedupes", () => {
    const store = new ConditionStore();
    const x = store.choice(1, 0);
    const y = store.choice(1, 1);
    const inner = store.or([x, y]);
    expect(store.or([inner, x])).toBe(inner);
  });

  it("evaluates conditions against full histories", () => {
    const store = new ConditionStore();
    const a = store.choice(1, 0);
    const b = store.choice(2, 1);
    const both = store.and(a, b);
    const either = store.or([a, b]);
    expect(
      store.evaluate(
        both,
        new Map([
          [1, 0],
          [2, 1],
        ]),
      ),
    ).toBe(true);
    expect(store.evaluate(either, new Map([[1, 1]]))).toBe(false);
    expect(
      store.evaluate(
        either,
        new Map([
          [1, 1],
          [2, 1],
        ]),
      ),
    ).toBe(true);
  });

  it("evaluates partially with unknowns as null", () => {
    const store = new ConditionStore();
    const a = store.choice(1, 0);
    const b = store.choice(2, 0);
    const both = store.and(a, b);
    const either = store.or([a, b]);
    expect(store.evaluatePartial(both, new Map([[1, 1]]))).toBe(false);
    expect(store.evaluatePartial(both, new Map([[1, 0]]))).toBeNull();
    expect(store.evaluatePartial(either, new Map([[1, 0]]))).toBe(true);
  });

  it("widens a condition past the product cap to always and marks degraded", () => {
    const store = new ConditionStore();
    // 300 个互不相干的选择：谁也吸收不了谁，乘积数直接超上限
    const many = Array.from({ length: 300 }, (_, index) =>
      store.choice(index, 0),
    );
    expect(store.degraded).toBe(false);
    // 放宽成恒真而不是抛错：宁可丢掉分支标注，也不能让面板开天窗
    expect(store.or(many)).toBe(TRUE_CONDITION);
    expect(store.degraded).toBe(true);
  });

  it("describes DNF products with merged option sets", () => {
    const store = new ConditionStore();
    const merged = store.or([store.choice(1, 0), store.choice(1, 1)]);
    const display = store.describe(merged);
    expect(display.kind).toBe("any");
    if (display.kind !== "any") return;
    expect(display.alternatives).toHaveLength(1);
    expect(display.alternatives[0]!.choices).toEqual([
      { decisionId: 1, optionIndexes: [0, 1] },
    ]);
  });
});

describe("oracle 一致性（单元剧本）", () => {
  const scripts: readonly (readonly string[])[] = [
    [
      '[decision(options="A;B", values="1;2")]',
      '[name="公共"]共享',
      '[predicate(references="1")]',
      '[name="A"]分支A',
      '[predicate(references="2")]',
      '[name="B"]分支B',
      "[predicate]",
      '[name="后"]之后',
    ],
    [
      '[decision(options="外1;外2;外3", values="1;2;3")]',
      '[predicate(references="1")]',
      '[decision(options="内", values="4")]',
      '[predicate(references="4")]',
      '[name="内层"]内层文本',
      '[predicate(references="2")]',
      '[name="外2专属"]外2',
      '[predicate(references="3")]',
      '[name="外3专属"]外3',
    ],
    [
      '[decision(options="A;B", values="1;2")]',
      '[predicate(references="1")]',
      '[multiline(name="甲")]一',
      '[multiline(name="甲", end=true)]二',
      '[subtitle(text="字幕")]',
      '[name="对白"]内容',
    ],
  ];

  it.each(scripts)(
    "analyzer matches the independent oracle on every path",
    (script) => {
      const lines = parseScript(script);
      const document = buildLogAll(lines);
      const traces = enumerateOracleTraces(lines);
      expect(traces.length).toBeGreaterThan(0);
      for (const trace of traces) {
        const projected = projectVisibleEntries(
          document,
          new Map(trace.choices.map((c) => [c.lineIndex, c.optionIndex])),
        );
        expect(projected.map((e) => e.lineIndex)).toEqual(
          trace.entries.map((e) => e.lineIndex),
        );
      }
    },
  );
});
