import { Container, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";

import { AvgDisplayPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/AvgDisplayPanel";

import type { AvgDisplayInput } from "../src/widgets/StoryPlayer/engine/types";

function input(overrides: Partial<AvgDisplayInput> = {}): AvgDisplayInput {
  return {
    block: false,
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
  // Native port: AVGDisplayableHolder._ApplyFadeFeature (0x183e372e0,
  // 2.7.61) skips the whole fade feature when CalculateFadetime(duration)
  // <= 0, leaving alpha untouched (position/scale still snap to their end
  // point). The fast-forward gear (animateRatio = 0) drives every bg fade
  // into that branch.
  it("leaves bg alpha untouched when durationMs <= 0", async () => {
    const { panel, slots } = makePanel();
    // Establish a dimmed overlay (afrom == ato snaps alpha directly).
    await panel.display(
      input({ alphaFrom: 0.5, alphaTo: 0.5, durationMs: 1000 }),
    );
    const root = slots.bgover.children[0];
    expect(root.alpha).toBe(0.5);

    // Fast-forward replay (durationMs = 0) must not snap alpha to ato.
    await panel.display(input({ alphaFrom: 1, alphaTo: 0, durationMs: 0 }));
    expect(slots.bgover.children[0]).toBe(root);
    expect(root.alpha).toBe(0.5);
  });

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

  // Native port: _DisplayInternal (0x183e38f70) compares the enums parsed by
  // GenTypeFromRaw / GenSlotFromRaw, so numeric spellings and aliases of the
  // same member ("5"/"bg", "1"/"bgover") or two unknown values (both NONE)
  // never rebuild a live entry; a real enum change does.
  it("does not rebuild when style/slot only differ in raw spelling", async () => {
    const { panel, slots } = makePanel();
    await panel.display(
      input({ alphaFrom: 0.5, alphaTo: 0.5, durationMs: 1000 }),
    );
    const root = slots.bgover.children[0];

    await panel.display(input({ style: "5", slot: "bgover", durationMs: 0 }));
    expect(slots.bgover.children[0]).toBe(root);
    expect(root.alpha).toBe(0.5);

    // A known member vs an unknown value IS an enum change (bg -> NONE):
    // rebuild, then two unknown values share the NONE bucket -- no rebuild.
    await panel.display(input({ style: "weird", slot: "bgover" }));
    const unknownRoot = slots.bgover.children[0];
    expect(unknownRoot).not.toBe(root);
    await panel.display(input({ style: "other", slot: "bgover" }));
    expect(slots.bgover.children[0]).toBe(unknownRoot);
  });

  it("rebuilds when the parsed style or slot enum actually changes", async () => {
    const { panel, slots } = makePanel();
    await panel.display(
      input({ alphaFrom: 0.5, alphaTo: 0.5, durationMs: 1000 }),
    );
    const root = slots.bgover.children[0];

    await panel.display(
      input({ style: "4", name: "$eb_glow_s", durationMs: 0 }),
    );
    expect(slots.bgover.children).toHaveLength(1);
    expect(slots.bgover.children[0]).not.toBe(root);

    await panel.display(input({ style: "bg", slot: "cgover", durationMs: 0 }));
    expect(slots.bgover.children).toHaveLength(0);
    expect(slots.cgover.children).toHaveLength(1);
  });
});
