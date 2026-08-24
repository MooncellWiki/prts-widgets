import { Container, Rectangle, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { CharacterCutinPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/CharacterCutinPanel";

import type { CharacterCutinInput } from "../src/widgets/StoryPlayer/engine/types";

type Update = (progress: number) => void;

function input(
  overrides: Partial<CharacterCutinInput> = {},
): CharacterCutinInput {
  return {
    block: true,
    characterKey: "avg_test",
    charOffsetX: 0,
    charOffsetY: 0,
    expression: "1$1",
    fadeMs: 0,
    fadeStyle: undefined,
    offsetX: 0,
    offsetY: 0,
    povX: 0,
    povY: 0,
    widgetId: "1",
    width: 200,
    zoom: 1,
    ...overrides,
  };
}

function texture(width: number, height: number): Texture {
  return new Texture({ frame: new Rectangle(0, 0, width, height) });
}

async function instantTween(
  _durationMs: number,
  update: Update,
  complete?: () => void,
): Promise<void> {
  update(1);
  complete?.();
}

/** Captures tween callbacks so tests can drive progress manually. */
function captureTween() {
  const updates: Update[] = [];
  const completions: Array<() => void> = [];
  const tween = async (
    _durationMs: number,
    update: Update,
    complete?: () => void,
  ): Promise<void> => {
    updates.push(update);
    completions.push(() => complete?.());
  };
  return {
    drive(index: number, progress: number): void {
      updates[index]!(progress);
      if (progress >= 1) completions[index]!();
    },
    tween,
  };
}

describe("CharacterCutinPanel", () => {
  it("renders the character at original size in a full-height mask at screen center + offset", async () => {
    const layer = new Container();
    const tex = texture(120, 300);
    const loadTexture = vi.fn().mockResolvedValue(tex);
    const panel = new CharacterCutinPanel(layer, loadTexture, instantTween);

    await panel.run(input({ offsetX: -300, offsetY: 40 }));

    expect(layer.children).toHaveLength(1);
    const root = layer.children[0]!;
    // Slot center = screen center + (offsetx, offsety) (Unity y-up flipped).
    expect(root.x).toBe(340);
    expect(root.y).toBe(320);

    const state = (panel as any).slots.get("1");
    // Mask is width x full canvas height under the default align.
    expect(state.maskSize).toEqual({ h: 720, w: 200 });
    expect(root.mask).toBe(state.mask);

    const sprite = state.chars[0];
    expect(sprite.anchor.x).toBe(0.5);
    expect(sprite.anchor.y).toBe(1);
    // No stretching: the texture keeps its original scale, only the mask crops.
    expect(sprite.scale.x).toBe(1);
    expect(sprite.scale.y).toBe(1);
    // charOffsetY = 0 parks the feet on the mask bottom (720 / 2).
    expect(sprite.x).toBe(0);
    expect(sprite.y).toBe(360);
    // fade style: alpha tween completed to 1 with the mask at full size.
    expect(root.alpha).toBe(1);
  });

  it("applies zoom, pov, and charOffset keys to the slot hierarchy", async () => {
    const layer = new Container();
    const panel = new CharacterCutinPanel(
      layer,
      async () => texture(120, 300),
      instantTween,
    );

    await panel.run(
      input({
        charOffsetX: 5,
        charOffsetY: -20,
        povX: -50,
        povY: 30,
        zoom: 2,
      }),
    );

    const state = (panel as any).slots.get("1");
    // _zoomAndPovRectTransform: localScale = zoom, anchoredPosition =
    // (-povX, -povY) in Unity y-up, flipped for PIXI.
    expect(state.content.scale.x).toBe(2);
    expect(state.content.x).toBe(50);
    expect(state.content.y).toBe(30);
    expect(state.chars[0].x).toBe(5);
    expect(state.chars[0].y).toBe(380);
  });

  it("expands the mask rect from the pinned edge instead of scaling the sprite", async () => {
    const layer = new Container();
    const { drive, tween } = captureTween();
    const panel = new CharacterCutinPanel(
      layer,
      async () => texture(120, 300),
      tween,
    );

    await panel.run(
      input({
        block: false,
        fadeMs: 100,
        fadeStyle: "horiz_expand_left2right",
      }),
    );
    drive(0, 0.5);

    const state = (panel as any).slots.get("1");
    expect(state.maskSize).toEqual({ h: 720, w: 100 });
    expect(state.root.alpha).toBe(1);
    expect(state.chars[0].scale.x).toBe(1);
    expect(state.chars[0].x).toBe(0);

    drive(0, 1);
    expect(state.maskSize).toEqual({ h: 720, w: 200 });
  });

  it("SlotUpdate interpolates from the current layout instead of replaying the entry", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(texture(120, 300));
    const first = captureTween();
    let active = first.tween;
    const panel = new CharacterCutinPanel(layer, loadTexture, (d, u, c) =>
      active(d, u, c),
    );

    await panel.run(
      input({
        block: false,
        fadeMs: 100,
        fadeStyle: "horiz_expand_left2right",
        offsetX: -300,
      }),
    );
    first.drive(0, 1);

    const second = captureTween();
    active = second.tween;
    await panel.run(
      input({
        block: false,
        fadeMs: 100,
        fadeStyle: "horiz_expand_left2right",
        offsetX: 300,
        width: 300,
      }),
    );
    second.drive(0, 0.5);

    const state = (panel as any).slots.get("1");
    // Root glides 340 -> 940, mask width 200 -> 300; no fresh entry replay
    // and no second sprite for the same character identity.
    expect(state.root.x).toBe(640);
    expect(state.maskSize).toEqual({ h: 720, w: 250 });
    expect(state.root.alpha).toBe(1);
    expect(state.chars).toHaveLength(1);
    expect(loadTexture).toHaveBeenCalledTimes(1);
    expect(layer.children).toHaveLength(1);
  });

  it("SlotUpdate crossfades to a new character over the tween duration", async () => {
    const layer = new Container();
    const texA = texture(120, 300);
    const texB = texture(140, 300);
    const loadTexture = vi.fn(async (cutin: CharacterCutinInput) =>
      cutin.expression === "2$2" ? texB : texA,
    );
    const first = captureTween();
    let active = first.tween;
    const panel = new CharacterCutinPanel(layer, loadTexture, (d, u, c) =>
      active(d, u, c),
    );

    await panel.run(input({ block: false, fadeMs: 100 }));
    first.drive(0, 1);

    const second = captureTween();
    active = second.tween;
    await panel.run(input({ block: false, expression: "2$2", fadeMs: 100 }));
    second.drive(0, 0.5);

    const state = (panel as any).slots.get("1");
    expect(state.chars).toHaveLength(2);
    expect(state.chars[0].alpha).toBeCloseTo(0.5);
    expect(state.chars[1].alpha).toBeCloseTo(0.5);

    second.drive(0, 1);
    expect(state.chars).toHaveLength(1);
    expect(state.chars[0].texture).toBe(texB);
    expect(state.chars[0].alpha).toBe(1);
  });

  it("hide collapses the mask along the stored style and removes the slot", async () => {
    const layer = new Container();
    const { drive, tween } = captureTween();
    const panel = new CharacterCutinPanel(
      layer,
      async () => texture(120, 300),
      tween,
    );

    await panel.run(
      input({
        block: false,
        fadeMs: 100,
        fadeStyle: "horiz_expand_right2left",
      }),
    );
    drive(0, 1);
    expect((panel as any).slots.size).toBe(1);

    await panel.run(
      input({
        block: false,
        characterKey: undefined,
        expression: undefined,
        fadeMs: 100,
        fadeStyle: undefined,
      }),
    );
    drive(1, 0.5);

    const state = (panel as any).slots.get("1");
    expect(state.maskSize).toEqual({ h: 720, w: 100 });
    expect(state.root.alpha).toBe(1);

    drive(1, 1);
    // Native b__0 @ 0x183e62c90 recycles the slot and drops the widgetID.
    expect((panel as any).slots.has("1")).toBe(false);
    expect(layer.children).toHaveLength(0);
  });

  it("hide of a fade-style slot tweens alpha back to zero", async () => {
    const layer = new Container();
    const { drive, tween } = captureTween();
    const panel = new CharacterCutinPanel(
      layer,
      async () => texture(120, 300),
      tween,
    );

    await panel.run(input({ block: false, fadeMs: 100 }));
    drive(0, 1);

    await panel.run(
      input({
        block: false,
        characterKey: undefined,
        expression: undefined,
        fadeMs: 100,
      }),
    );
    drive(1, 0.5);

    const state = (panel as any).slots.get("1");
    expect(state.root.alpha).toBeCloseTo(0.5);
    expect(state.maskSize).toEqual({ h: 720, w: 200 });

    drive(1, 1);
    expect((panel as any).slots.has("1")).toBe(false);
  });

  it("still runs the show tween for an unresolvable name to keep block timing", async () => {
    const layer = new Container();
    const { drive, tween } = captureTween();
    const tweenSpy = vi.fn(tween);
    const loadTexture = vi.fn();
    const panel = new CharacterCutinPanel(layer, loadTexture, tweenSpy);

    await panel.run(
      input({
        block: false,
        characterKey: undefined,
        characterMissing: true,
        expression: undefined,
        fadeMs: 250,
      }),
    );

    expect(tweenSpy).toHaveBeenCalledWith(250, expect.any(Function));
    expect(loadTexture).not.toHaveBeenCalled();
    const state = (panel as any).slots.get("1");
    expect(state.chars).toHaveLength(0);

    drive(0, 1);
    expect((panel as any).slots.has("1")).toBe(true);
  });

  it("clear drops one widget or every slot", async () => {
    const layer = new Container();
    const panel = new CharacterCutinPanel(
      layer,
      async () => texture(120, 300),
      instantTween,
    );

    await panel.run(input({ widgetId: "1" }));
    await panel.run(input({ widgetId: "2" }));
    panel.clear("1");
    expect((panel as any).slots.has("1")).toBe(false);
    expect((panel as any).slots.has("2")).toBe(true);

    panel.clear();
    expect((panel as any).slots.size).toBe(0);
    expect(layer.children).toHaveLength(0);
  });
});
