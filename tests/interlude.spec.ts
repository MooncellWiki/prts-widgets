import { Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { InterludePanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/InterludePanel";

import type { InterludeInput } from "../src/widgets/StoryPlayer/engine/types";

function input(overrides: Partial<InterludeInput> = {}): InterludeInput {
  return {
    alphaDurationMs: 0,
    alphaFrom: -1,
    alphaTo: -1,
    block: true,
    channel: 3,
    charName: "",
    clear: false,
    direction: "",
    durationMs: 0,
    maskId: "square",
    name: "",
    offset: { x: 0, y: 0 },
    scaleDurationMs: 0,
    size: { x: 300, y: 300 },
    slot: "",
    style: 0,
    switchOn: true,
    templateSizeDurationMs: 0,
    templateSizeFrom: { x: 1, y: 1 },
    templateSizeTo: { x: 1, y: 1 },
    type: 0,
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

describe("InterludePanel", () => {
  it("reuses a channel, adds an element, toggles it, and clears the channel", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const tween = vi.fn(
      async (
        _duration: number,
        update: (progress: number) => void,
        complete?: () => void,
      ) => {
        update(1);
        complete?.();
      },
    );
    const panel = new InterludePanel(layer, loadTexture, tween);

    await panel.run(input());
    expect(layer.children).toHaveLength(1);

    await panel.run(input({ name: "avg_test", slot: "m", type: 2 }));
    expect(layer.children).toHaveLength(1);
    expect(loadTexture).toHaveBeenCalledOnce();

    await panel.run(input({ slot: "m", switchOn: false, type: 2 }));
    const state = (panel as any).channels.get(3);
    expect(state.elements.get("m").visible).toBe(false);

    await panel.run(input({ clear: true }));
    expect(layer.children).toHaveLength(0);
  });

  it("clears every channel when channel is negative", async () => {
    const layer = new Container();
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      tweenImmediately,
    );
    await panel.run(input({ channel: 3 }));
    await panel.run(input({ channel: 4 }));

    await panel.run(input({ channel: -1, clear: true }));
    expect(layer.children).toHaveLength(0);
  });
});
