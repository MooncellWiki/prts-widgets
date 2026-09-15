import { Container, Text, Texture } from "pixi.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnimTextPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/AnimTextPanel";

import type { AnimTextInput } from "../src/widgets/StoryPlayer/engine/types";

const { loadMock } = vi.hoisted(() => ({
  loadMock: vi.fn(async () => Texture.WHITE),
}));

vi.mock("pixi.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("pixi.js")>()),
  Assets: { load: loadMock },
}));

function input(overrides: Partial<AnimTextInput> = {}): AnimTextInput {
  return {
    block: false,
    content: "",
    id: "at1",
    name: "group_location_stamp",
    position: { x: -400, y: -200 },
    style: "avg_both",
    ...overrides,
  };
}

// tween 永不完成即可:block=false 时 show() 不等动画,文本属性可当场断言。
const pendingTween = () => new Promise<void>(() => {});

function collectTexts(container: Container): Text[] {
  const texts: Text[] = [];
  for (const child of container.children) {
    if (child instanceof Text) texts.push(child);
    else if (child instanceof Container) texts.push(...collectTexts(child));
  }
  return texts;
}

async function stampTexts(
  panel: AnimTextPanel,
  layer: Container,
  input: AnimTextInput,
): Promise<{ main: Text; sub: Text }> {
  await panel.show(input);
  const root = layer.children.at(-1) as Container;
  const [main, sub] = collectTexts(root).sort(
    (a, b) => a.position.y - b.position.y,
  );
  return { main: main!, sub: sub! };
}

describe("AnimTextPanel", () => {
  beforeEach(() => {
    loadMock.mockClear();
  });

  it("fills slot i from <p=i+1> by index, so a <p=2>-only stamp lands in the sub slot", async () => {
    const layer = new Container();
    const panel = new AnimTextPanel(layer, pendingTween);

    const ordered = await stampTexts(
      panel,
      layer,
      input({
        content: "<p=1>维多利亚边境，布查特市</><p=2>一个月后</>",
      }),
    );
    expect(ordered.main.text).toBe("维多利亚边境，布查特市");
    expect(ordered.sub.text).toBe("一个月后");

    // 生产样本 level_main_15-12_end.txt:342 只写 <p=2> 且 avg_only_medium:
    // native 语义是槽 0 留空、文本进槽 1(sub),而非按出现顺序填 main。
    const skipped = await stampTexts(
      panel,
      layer,
      input({
        content: "<p=2>距离本舰骚乱开始已过去五十七分钟</>",
        style: "avg_only_medium",
      }),
    );
    expect(skipped.main.text).toBe("");
    expect(skipped.sub.text).toBe("距离本舰骚乱开始已过去五十七分钟");
    expect(skipped.main.visible).toBe(false);
    expect(skipped.sub.visible).toBe(true);
  });

  it(
    String.raw`unescapes literal \n into a newline before split parsing`,
    async () => {
      const layer = new Container();
      const panel = new AnimTextPanel(layer, pendingTween);
      const { main } = await stampTexts(
        panel,
        layer,
        input({
          content: String.raw`<p=1>第一行\n第二行</>`,
        }),
      );
      expect(main.text).toBe("第一行\n第二行");
    },
  );

  it("drops <p=0> with a warning and keeps other slots intact", async () => {
    const layer = new Container();
    const warning = vi.fn();
    const panel = new AnimTextPanel(layer, pendingTween, warning);
    const { main, sub } = await stampTexts(
      panel,
      layer,
      input({
        content: "<p=0>非法段</><p=1>主行</><p=2>副行</>",
      }),
    );
    expect(warning).toHaveBeenCalledWith(
      "animtext split content id should start from 1, not 0",
    );
    expect(main.text).toBe("主行");
    expect(sub.text).toBe("副行");
  });

  it("hides the sub row for avg_only_heavy and rejects unknown templates", async () => {
    const layer = new Container();
    const warning = vi.fn();
    const panel = new AnimTextPanel(layer, pendingTween, warning);
    const { main, sub } = await stampTexts(
      panel,
      layer,
      input({
        content: "<p=1>舰船附近的无人地带</>",
        style: "avg_only_heavy",
      }),
    );
    expect(main.text).toBe("舰船附近的无人地带");
    expect(main.visible).toBe(true);
    expect(sub.visible).toBe(false);

    await panel.show(input({ content: "<p=1>x</>", name: "other" }));
    expect(warning).toHaveBeenCalledWith("unsupported_visual animtext:other");
    expect(layer.children).toHaveLength(1);
  });
});
