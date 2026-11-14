import { Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { AvgDisplayPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/AvgDisplayPanel";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type AvgDisplayInput,
} from "../src/widgets/StoryPlayer/engine/types";

function input(overrides: Partial<AvgDisplayInput> = {}): AvgDisplayInput {
  return {
    durationMs: 0,
    entryIndex: 0,
    id: "1",
    layer: 1,
    name: "bg_black",
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    slot: "bgover",
    style: "bg",
    ...overrides,
  };
}

async function tweenImmediately(
  _duration: number,
  update: (progress: number) => void,
  complete?: () => void,
): Promise<void> {
  update(1);
  complete?.();
}

function makePanel(): {
  panel: AvgDisplayPanel;
  slots: Record<string, Container>;
} {
  const slots = {
    bgover: new Container(),
    cgover: new Container(),
    charover: new Container(),
  };
  const panel = new AvgDisplayPanel(
    slots,
    async (name) => (name === "missing" ? null : Texture.WHITE),
    tweenImmediately,
  );
  return { panel, slots };
}

describe("AvgDisplayPanel", () => {
  it.each(["bgover", "charover", "cgover"] as const)(
    "fills the story canvas for bg in %s",
    async (slot) => {
      const { panel, slots } = makePanel();

      await panel.display(input({ slot, x: 100, y: 50 }));

      expect(slots[slot]!.children[0]!.getBounds()).toMatchObject({
        minX: 0,
        minY: 0,
        maxX: STORY_WIDTH,
        maxY: STORY_HEIGHT,
      });
    },
  );

  it("returns one sequence for position and scale and keeps them in step", async () => {
    const bgover = new Container();
    const animation = Promise.withResolvers<void>();
    const tween = vi.fn(
      (
        _durationMs: number,
        _step: (progress: number) => void,
        _done?: () => void,
      ) => animation.promise,
    );
    const panel = new AvgDisplayPanel(
      { bgover, cgover: new Container(), charover: new Container() },
      async () => Texture.WHITE,
      tween,
    );
    const onComplete = vi.fn();
    const { animation: running } = await panel.display(
      input({
        durationMs: 1000,
        entryFrom: 0,
        entryTo: 1,
        scaleXFrom: 1,
        scaleXTo: 2,
        scaleYFrom: 2,
        scaleYTo: 3,
        style: "animekv",
        xFrom: 0,
        xTo: 100,
        yFrom: 10,
        yTo: 30,
      }),
      onComplete,
    );
    expect(running).toBe(animation.promise);
    expect(tween).toHaveBeenCalledTimes(1);
    const [durationMs, step, complete] = tween.mock.calls[0]!;
    expect(durationMs).toBe(1000);

    const root = bgover.children[0]!;
    step(0.5);
    expect(root.position).toMatchObject({ x: 690, y: 340 });
    expect(root.scale).toMatchObject({ x: 1.5, y: 2.5 });
    expect(onComplete).not.toHaveBeenCalled();

    complete?.();
    animation.resolve();
    await running;
    expect(root.position).toMatchObject({ x: 740, y: 330 });
    expect(root.scale).toMatchObject({ x: 2, y: 3 });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // Native port: AVGDisplayableHolder._ApplyFadeFeature (2.7.81 VA
  // 0x183F98A70) skips the whole fade feature when CalculateFadetime(duration)
  // <= 0, leaving alpha untouched (position/scale still snap to their end
  // point). The fast-forward gear (animateRatio = 0) drives every bg fade
  // into that branch.
  it("leaves bg alpha untouched when durationMs <= 0", async () => {
    const { panel, slots } = makePanel();
    // Establish a dimmed overlay (afrom == ato snaps alpha directly).
    const { animation } = await panel.display(
      input({ alphaFrom: 0.5, alphaTo: 0.5, durationMs: 1000 }),
    );
    expect(animation).toBeUndefined();
    const root = slots.bgover.children[0];
    expect(root.alpha).toBe(0.5);

    // Fast-forward replay (durationMs = 0) must not snap alpha to ato.
    await panel.display(input({ alphaFrom: 1, alphaTo: 0, durationMs: 0 }));
    expect(slots.bgover.children[0]).toBe(root);
    expect(root.alpha).toBe(0.5);
  });

  // A fresh holder keeps the prefab alpha: `displayable_image`'s root
  // CanvasGroup ships m_Alpha = 1 (avg/[uc]common.ab).
  it("keeps a fresh duration-less bg visible instead of fading to the default ato=0", async () => {
    const { panel, slots } = makePanel();
    await panel.display(input({ durationMs: 0 }));
    expect(slots.bgover.children[0].alpha).toBe(1);
  });

  it("still tweens bg alpha when durationMs > 0", async () => {
    const { panel, slots } = makePanel();
    await panel.display(input({ alphaFrom: 1, alphaTo: 0, durationMs: 700 }));
    expect(slots.bgover.children[0].alpha).toBe(0);
  });

  it("snaps position to the end point when durationMs <= 0", async () => {
    const { panel, slots } = makePanel();
    await panel.display(
      input({ style: "effect", name: "$e_x", x: 10, xTo: 30, durationMs: 0 }),
    );
    const root = slots.bgover.children[0];
    expect(root.position.x).toBe(640 + 30);
  });

  // Native port: _DisplayInternal (2.7.81 VA 0x183F9A5F0) keeps the id's
  // holder while the parsed slot/type enums match and rebuilds it otherwise.
  // Spelling variants ("5", " +05", "bg") are folded by the runtime before
  // they reach the panel (see tests/runtime/panels.spec.ts).
  it("rebuilds only when style or slot changes", async () => {
    const { panel, slots } = makePanel();
    await panel.display(
      input({ alphaFrom: 0.5, alphaTo: 0.5, durationMs: 1000 }),
    );
    const root = slots.bgover.children[0];

    await panel.display(input({ durationMs: 0 }));
    expect(slots.bgover.children[0]).toBe(root);
    expect(root.alpha).toBe(0.5);

    await panel.display(
      input({ style: "bgeffect", name: "$eb_glow_s", durationMs: 0 }),
    );
    expect(slots.bgover.children).toHaveLength(1);
    expect(slots.bgover.children[0]).not.toBe(root);

    await panel.display(input({ style: "bg", slot: "cgover", durationMs: 0 }));
    expect(slots.bgover.children).toHaveLength(0);
    expect(slots.cgover.children).toHaveLength(1);
  });
});
