import {
  Assets,
  CanvasTextMetrics,
  Container,
  Texture,
  type Sprite,
  type Text,
} from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DialogPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/DialogPanel";

interface Fade {
  done?: () => void;
  durationMs: number;
  step: (progress: number) => void;
}

// happy-dom has no 2D canvas, so text measurement is stubbed: "tall" is a
// 200px message, anything else a single 30px line.
async function mountPanel() {
  vi.spyOn(Assets, "load").mockResolvedValue(Texture.WHITE as never);
  vi.spyOn(CanvasTextMetrics, "measureText").mockImplementation((text) => {
    const metrics: Pick<CanvasTextMetrics, "height" | "width"> = {
      height: text === "tall" ? 200 : 30,
      width: 0,
    };
    return metrics as CanvasTextMetrics;
  });
  const fades: Fade[] = [];
  const layer = new Container();
  const panel = new DialogPanel(layer, undefined, (durationMs, step, done) => {
    fades.push({ done, durationMs, step });
    return Promise.resolve();
  });
  await panel.mount();
  const root = layer.children[0] as Container;
  const [, bottom, , dialogue] = root.children as [Sprite, Sprite, Text, Text];
  return { bottom, dialogue, fades, panel, root };
}

describe("DialogPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts hidden and fades in over 150ms the first time it shows", async () => {
    const { fades, panel, root } = await mountPanel();
    // Native OnReset forces the CanvasGroup to alpha 0 without a tween.
    expect(root.alpha).toBe(0);
    expect(root.visible).toBe(false);

    panel.setDialogue("A", "hello");
    expect(fades).toHaveLength(1);
    expect(fades[0]!.durationMs).toBe(150);
    expect(root.visible).toBe(true);
    fades[0]!.step(0.5);
    expect(root.alpha).toBe(0.5);
    fades[0]!.step(1);
    fades[0]!.done?.();
    expect(root.alpha).toBe(1);

    // set_isHidden(false) on a shown panel is a no-op: typing the next
    // characters must not restart the fade.
    panel.setDialogue("A", "hello!");
    expect(fades).toHaveLength(1);
  });

  it("fades the whole panel out on hide and keeps the last text on screen", async () => {
    const { dialogue, fades, panel, root } = await mountPanel();
    panel.setDialogue("A", "hello");
    fades[0]!.step(1);

    panel.hide();
    expect(fades).toHaveLength(2);
    expect(dialogue.text).toBe("hello");
    fades[1]!.step(0.4);
    expect(root.alpha).toBeCloseTo(0.6);
    fades[1]!.step(1);
    fades[1]!.done?.();
    expect(root.alpha).toBe(0);
    expect(root.visible).toBe(false);

    panel.hide();
    expect(fades).toHaveLength(2);
  });

  it("reverses an in-flight fade from the current alpha", async () => {
    const { fades, panel, root } = await mountPanel();
    panel.setDialogue("A", "hello");
    fades[0]!.step(0.6);

    panel.hide();
    fades[1]!.step(0.5);
    expect(root.alpha).toBeCloseTo(0.3);
    // DOKill: the superseded fade-in no longer drives the alpha.
    fades[0]!.step(1);
    fades[0]!.done?.();
    expect(root.alpha).toBeCloseTo(0.3);
  });

  it("moves a tall message up without growing the bottom frame", async () => {
    const { bottom, dialogue, panel } = await mountPanel();
    panel.setDialogue("A", "", undefined, "tall");

    expect(dialogue.y).toBe(720 - 93.5 - (200 - 89));
    // _textContainer only follows the dialog preset / font size settings.
    expect(bottom.height).toBe(182);
    expect(bottom.y).toBe(720 - 182);
  });

  it("places the message once per command, from its layout text only", async () => {
    const { dialogue, panel } = await mountPanel();
    panel.setDialogue("A", "", undefined, "tall");
    const raised = dialogue.y;

    // Typewriter updates carry no layout text and leave the position alone.
    panel.setDialogue("A", "t");
    expect(dialogue.y).toBe(raised);

    // A multiline fragment is measured on its own, even though the box shows
    // the whole (tall) accumulated run.
    panel.setDialogue("A", "tall", undefined, "short");
    expect(dialogue.y).toBe(720 - 93.5);
  });
});
