import { describe, expect, it, vi } from "vitest";

// DialogPanel.mount() 走 Assets.load 拉内置 UI 贴片；单测里让它失败，
// 走 catch 分支（上下黑条为 null，面板/文本仍在），只验证可见性语义。
// happy-dom 没有 canvas 2d context，BestFit 测量一并 stub 掉。
vi.mock("pixi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pixi.js")>();
  return {
    ...actual,
    Assets: {
      ...actual.Assets,
      load: vi.fn().mockRejectedValue(new Error("assets disabled in test")),
    },
    CanvasTextMetrics: {
      ...actual.CanvasTextMetrics,
      measureText: vi.fn().mockReturnValue({ height: 0, width: 0 }),
    },
  };
});

const { DialogPanel } =
  await import("../src/widgets/StoryPlayer/engine/rendering/panels/DialogPanel");

describe("DialogPanel", () => {
  it("hides on empty content but stays visible for the endtip override", async () => {
    const warns: string[] = [];
    const { Container } = await import("pixi.js");
    const panel = new DialogPanel(new Container(), (detail: string) =>
      warns.push(detail),
    );
    await panel.mount();
    expect(warns).toEqual(["failed ui: sprite_avg_cutscene"]);

    // `_ExecuteDialog` 的空 content：框整体隐藏
    panel.setDialogue("", "");
    const state = panel as unknown as {
      dialogue: { visible: boolean };
      panel: { visible: boolean };
      speaker: { visible: boolean };
    };
    expect(state.panel.visible).toBe(false);
    expect(state.speaker.visible).toBe(false);
    expect(state.dialogue.visible).toBe(false);

    // 正常有内容的对白：显示
    panel.setDialogue("阿米娅", "你好");
    expect(state.panel.visible).toBe(true);

    // `_ExecuteEndtip`：set_isHidden(false) + BeginText(""),
    // 空内容也要显示空框（2.7.61: 0x183E73AB0）
    panel.setDialogue("", "", undefined, { forceVisible: true });
    expect(state.panel.visible).toBe(true);
    expect(state.speaker.visible).toBe(true);
    expect(state.dialogue.visible).toBe(true);
  });
});
