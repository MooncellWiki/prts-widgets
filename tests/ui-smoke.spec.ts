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
    await new Promise((resolve) => setTimeout(resolve, 0));

    const text = host.textContent ?? "";
    expect(text).toContain("剧情选择");
    expect(text).toContain("选A / 选B");
    expect(text).toContain("共享文本");
    expect(text).toContain("甲分支");
    expect(text).toContain("乙分支");
    expect(text).toContain("选择「选A」"); // 条件标签
    expect(text).toContain("▶"); // 当前播放行高亮
    // 高亮行必须是甲分支（当前路径），不是乙分支
    const active = host.querySelector("[data-active-line]");
    expect(active?.textContent).toContain("甲分支");
    app.unmount();
  });
});
