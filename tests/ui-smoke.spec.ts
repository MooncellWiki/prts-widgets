import { createApp, h } from "vue";

import { NConfigProvider } from "naive-ui";
import { describe, expect, it } from "vitest";

import LogAllList from "../src/widgets/StoryPlayer/components/LogAllList.vue";
import { buildLogAll } from "../src/widgets/StoryPlayer/engine/log/index";
import { parseScript } from "../src/widgets/StoryPlayer/engine/parser";

describe("LogAllList UI smoke", () => {
  it("renders blocks with labels and highlights current path", async () => {
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
    const host = document.createElement("div");
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(NConfigProvider, null, {
          default: () =>
            h(LogAllList, {
              activeLineIndex: 4,
              document: logDocument,
              selections: [{ decisionId: 1, optionIndex: 0, value: 1 }],
            }),
        }),
    });
    app.mount(host);

    // 选择记录、公共文本、两个带条件标签的分栏、收尾依次渲染；▶ 为当前播放行高亮
    expect(host.textContent).toBe(
      "剧情选择选A / 选B公共共享文本选择「选A」： ▶A甲分支选择「选B」： B乙分支后收尾",
    );
    // 高亮行必须是甲分支（当前路径），不是乙分支
    const active = host.querySelector<HTMLElement>("[data-active-line]");
    expect(active?.dataset.activeLine).toBe("exact");
    expect(active?.textContent).toBe("▶A甲分支");
    app.unmount();
  });

  it("dims a route-conditional choice box with its branch block like ordinary text", async () => {
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

    const host = document.createElement("div");
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(NConfigProvider, null, {
          default: () =>
            h(LogAllList, {
              document: logDocument,
              selections: [{ decisionId: 1, optionIndex: 0, value: 1 }],
            }),
        }),
    });
    app.mount(host);

    // 「我们有什么计划？」与同分支的普通文本（外层三）在同一分栏，
    // 整栏一起淡化
    const choiceBlock = [...host.querySelectorAll(".conditional-block")].find(
      (el) => el.textContent?.includes("我们有什么计划？"),
    );
    expect(choiceBlock?.textContent).toBe(
      "选择「凯尔希」： C外层三剧情选择我们有什么计划？无分支",
    );
    expect(choiceBlock?.classList.contains("opacity-40")).toBe(true);
    // 汇合后的阿米娅文本保持正常显示（未被淡化）
    const convergeBlock = [...host.querySelectorAll(".conditional-block")].find(
      (el) => el.textContent?.includes("询问哪方面"),
    );
    expect(convergeBlock?.textContent).toBe(
      "选择「阿米娅 / 凯尔希」： 阿米娅询问哪方面",
    );
    expect(convergeBlock?.classList.contains("opacity-40")).toBe(false);
    app.unmount();
  });
});
