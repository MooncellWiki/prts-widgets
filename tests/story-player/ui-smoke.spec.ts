import { createApp } from "vue";

import { describe, expect, it, vi } from "vitest";

import LogAllList from "@/widgets/StoryPlayer/components/LogAllList.vue";
import LogAllPanel from "@/widgets/StoryPlayer/components/LogAllPanel.vue";
import {
  analyzeStoryFlow,
  buildLogAll,
  buildLogDocument,
  planChoicesForLine,
} from "@/widgets/StoryPlayer/engine/log/index";
import { parseScript } from "@/widgets/StoryPlayer/engine/parser";

function mountLogAll(props: InstanceType<typeof LogAllList>["$props"]) {
  const host = document.createElement("div");
  const app = createApp(LogAllList, { ...props });
  app.mount(host);
  return { app, host };
}

describe("LogAllList UI smoke", () => {
  it("renders blocks with labels and highlights current path", () => {
    const logDocument = buildLogAll(
      parseScript([
        '[decision(options="选A;选B", values="1;2")]',
        '[name="公共"]共享文本',
        '[predicate(references="1")]',
        '[name="A"]甲分支',
        '[predicate(references="2")]',
        '[name="B"]乙分支',
        "[predicate]",
        '[name="后"]收尾',
      ]),
    );
    const { app, host } = mountLogAll({
      activeLineIndex: 4,
      document: logDocument,
      selections: [{ decisionId: 1, optionIndex: 0, value: 1 }],
    });

    expect(
      Array.from(host.querySelectorAll(".log-all-list--root > li"), (block) =>
        block.textContent?.replace(/\s+/g, ""),
      ),
    ).toEqual([
      "剧情选择选A选B",
      "公共共享文本",
      "选择「选A」▶A甲分支",
      "选择「选B」B乙分支",
      "后收尾",
    ]);
    expect(
      host.querySelector(".log-choice-option--selected")?.textContent,
    ).toBe("选A");
    const active = host.querySelector<HTMLElement>("[data-active-line]");
    expect(active?.dataset.activeLine).toBe("exact");
    expect(active?.textContent).toBe("▶A甲分支");
    app.unmount();
  });

  it("plans the selected branch for multiline rows sharing a source line", () => {
    const flow = analyzeStoryFlow(
      parseScript([
        '[decision(options="选A;选B",values="1;2")]',
        '[predicate(references="1")]',
        '[multiline(name="A")]甲',
        '[predicate(references="2")]',
        '[multiline(name="B")]乙',
        '[predicate(references="1;2")]',
        "[multiline(end=true)]共同结尾",
      ]),
    );
    const onSeek = vi.fn((line: number, audience: number) =>
      planChoicesForLine(flow, line, audience),
    );
    const host = document.createElement("div");
    const app = createApp(LogAllPanel, {
      document: buildLogDocument(flow),
      onSeek,
      seekable: true,
    });
    app.mount(host);

    const rows = host.querySelectorAll<HTMLElement>(
      '.log-branch .log-row[role="button"]',
    );
    expect(Array.from(rows, (row) => row.textContent)).toEqual([
      "A甲共同结尾",
      "B乙共同结尾",
    ]);
    rows[0]!.click();
    rows[1]!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(onSeek.mock.calls.map(([line]) => line)).toEqual([7, 7]);
    expect(onSeek.mock.results.map(({ value }) => value)).toEqual([
      { ok: true, plan: { choices: new Map(), degraded: false } },
      { ok: true, plan: { choices: new Map([[1, 1]]), degraded: false } },
    ]);
    app.unmount();
  });

  it("drops the marker and speaker columns when nothing would fill them", () => {
    const mountList = (lines: string[], activeLineIndex?: number | null) => {
      const { app, host } = mountLogAll({
        activeLineIndex,
        document: buildLogAll(parseScript(lines)),
      });
      const root = host.querySelector("ul")!;
      return { app, root };
    };

    // 只加载文本（不传 activeLineIndex）+ 全旁白（EG-11 NBT 形状）：两列都不留
    const narration = mountList(["旁白一", "旁白二"]);
    expect(narration.root.classList.contains("log-all-list--no-marker")).toBe(
      true,
    );
    expect(narration.root.classList.contains("log-all-list--no-speaker")).toBe(
      true,
    );
    narration.app.unmount();

    // 播放中（activeLineIndex 为 null 也算在播）且有说话人：两列都保留
    const dialog = mountList(['[name="阿米娅"]你好', "旁白"], null);
    expect(dialog.root.classList.contains("log-all-list--no-marker")).toBe(
      false,
    );
    expect(dialog.root.classList.contains("log-all-list--no-speaker")).toBe(
      false,
    );
    dialog.app.unmount();

    // 没有说话人但有「剧情选择」行：说话人列要留给它
    const choice = mountList([
      '[decision(options="选A;选B", values="1;2")]',
      "旁白",
    ]);
    expect(choice.root.classList.contains("log-all-list--no-speaker")).toBe(
      false,
    );
    choice.app.unmount();
  });

  it("dims a route-conditional choice box with its branch block like ordinary text", () => {
    // 07-03 形状：内层单选项 decision 只在外层选项 3 的分支里执行；
    // 选了选项 1/2 的玩家被 refs=3 挡住，看不到这个选择框，
    // 但 refs=1 重新放行后的汇合文本（阿米娅）照常可见。
    // 选择行不做单独标注：跟普通文本一样，由所在条件分栏统一淡化。
    const logDocument = buildLogAll(
      parseScript([
        '[decision(options="阿米娅;沉默;凯尔希", values="1;2;3")]', // line 1
        '[predicate(references="1")]',
        '[name="A"]外层一',
        '[predicate(references="2")]',
        '[name="B"]外层二',
        '[predicate(references="3")]',
        '[name="C"]外层三',
        '[decision(options="我们有什么计划？", values="1")]', // line 8
        '[predicate(references="1")]',
        '[name="阿米娅"]询问哪方面', // line 10
      ]),
    );

    const { app, host } = mountLogAll({
      document: logDocument,
      selections: [{ decisionId: 1, optionIndex: 0, value: 1 }],
    });

    // 「我们有什么计划？」与同分支的普通文本（外层三）在同一分栏，
    // 整栏一起淡化
    const choiceBlock = [...host.querySelectorAll(".log-branch")].find((el) =>
      el.textContent?.includes("我们有什么计划？"),
    );
    expect(choiceBlock?.querySelector(".log-branch-label")?.textContent).toBe(
      "选择「凯尔希」",
    );
    expect(choiceBlock?.textContent).toContain("C外层三");
    expect(choiceBlock?.textContent).toContain("我们有什么计划？");
    expect(choiceBlock?.textContent).toContain("无分支");
    expect(choiceBlock?.classList.contains("log-branch--off")).toBe(true);
    // 汇合后的阿米娅文本保持正常显示（未被淡化）
    const convergeBlock = [...host.querySelectorAll(".log-branch")].find((el) =>
      el.textContent?.includes("询问哪方面"),
    );
    expect(convergeBlock?.querySelector(".log-branch-label")?.textContent).toBe(
      "选择「阿米娅 / 凯尔希」",
    );
    expect(convergeBlock?.classList.contains("log-branch--off")).toBe(false);
    app.unmount();
  });
});
