import { Container, Texture, type Sprite } from "pixi.js";
import { describe, expect, it } from "vitest";

import { CgItemPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/CgItemPanel";

import type { CgItemInput } from "../src/widgets/StoryPlayer/engine/types";

function input(key: string, overrides: Partial<CgItemInput> = {}): CgItemInput {
  return {
    alphaDelayMs: 0,
    alphaDurationMs: 0,
    alphaFrom: 1,
    alphaTo: 1,
    assetKey: key,
    block: false,
    ease: "Linear",
    height: 0,
    key,
    positionDelayMs: 0,
    positionDurationMs: 0,
    rotationDurationMs: 0,
    rotationFrom: -1,
    rotationTo: 0,
    scaleDelayMs: 0,
    scaleDurationMs: 0,
    scaleFrom: 1,
    scaleTo: 1,
    width: 0,
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

function deferredTexture() {
  let resolve!: (texture: Texture | null) => void;
  const promise = new Promise<Texture | null>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function manualTween() {
  let update: ((progress: number) => void) | undefined;
  const tween = (_duration: number, step: (progress: number) => void) => {
    update = step;
    return new Promise<void>(() => {});
  };
  return { step: (progress: number) => update?.(progress), tween };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index++) await Promise.resolve();
}

describe("CgItemPanel", () => {
  it("keeps different keys and replaces an equal key in place", async () => {
    const layer = new Container();
    const panel = new CgItemPanel(
      layer,
      async () => Texture.WHITE,
      tweenImmediately,
    );

    await panel.show(input("a"));
    const oldA = panel.targets("a")[0];
    await panel.show(input("b"));
    await panel.show(
      input("a", {
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 10, y: 20 },
      }),
    );

    expect(panel.targets("a")).toHaveLength(1);
    expect(panel.targets("b")).toHaveLength(1);
    expect(panel.targets("a")[0]).not.toBe(oldA);
    expect(layer.children).toHaveLength(2);
  });

  it("hides one key or clears all keys independently of block", async () => {
    const layer = new Container();
    const panel = new CgItemPanel(
      layer,
      async () => Texture.WHITE,
      tweenImmediately,
    );
    await panel.show(input("a"));
    await panel.show(input("b"));

    await panel.hide("a", 130, "Linear", true);
    expect(panel.targets("a")).toEqual([]);
    expect(panel.targets("b")).toHaveLength(1);

    await panel.hide(undefined, 130, "Linear", true);
    expect(panel.targets("")).toEqual([]);
    expect(layer.children).toHaveLength(0);
  });

  it("eases the native default InSine curve and falls back to it for unknown names", async () => {
    // `AVGShowItemCgSlot.Show` (0x183ed1810) reads ease via
    // `GetEnum<Ease>(param, "ease", (Ease)1, ignoreCase: false)`: the
    // call-site default (InSine, DOTween `Linear = 0` / `InSine = 1`) is
    // also returned for names the parser rejects. Explicit "Linear" must
    // stay linear because hidecgitem passes that default from runtime.ts.
    const inSineHalf = 100 * (1 - Math.SQRT1_2);
    const cases = [
      { ease: "InSine", expected: inSineHalf },
      { ease: "NoSuchEase", expected: inSineHalf },
      { ease: "Linear", expected: 50 },
    ];
    for (const { ease, expected } of cases) {
      const manual = manualTween();
      const panel = new CgItemPanel(
        new Container(),
        async () => Texture.WHITE,
        manual.tween,
      );
      await panel.show(
        input("a", {
          ease,
          positionDurationMs: 1000,
          positionFrom: { x: 0, y: 0 },
          positionTo: { x: 100, y: 0 },
        }),
      );
      await flushMicrotasks();
      manual.step(0.5);
      const sprite = panel.targets("a")[0]!.children[0] as Sprite;
      expect(sprite.position.x).toBeCloseTo(expected, 5);
    }
  });

  it("returns from a non-blocking show before the texture arrives", async () => {
    const layer = new Container();
    const deferred = deferredTexture();
    const panel = new CgItemPanel(
      layer,
      () => deferred.promise,
      tweenImmediately,
    );

    let finished = false;
    const task = panel.show(input("a")).then(() => {
      finished = true;
    });
    await flushMicrotasks();

    expect(finished).toBe(true);
    expect(panel.targets("a")).toHaveLength(1);
    expect(panel.targets("a")[0]!.children).toHaveLength(0);

    deferred.resolve(Texture.WHITE);
    await flushMicrotasks();
    expect(panel.targets("a")[0]!.children).toHaveLength(1);
    await task;
  });

  it("disposes the previous same-key entry before the new texture loads", async () => {
    const layer = new Container();
    const first = deferredTexture();
    const second = deferredTexture();
    let loader = () => first.promise;
    const panel = new CgItemPanel(layer, () => loader(), tweenImmediately);

    await panel.show(input("a"));
    await flushMicrotasks();
    const oldRoot = panel.targets("a")[0]!;

    loader = () => second.promise;
    await panel.show(input("a"));

    expect(panel.targets("a")[0]).not.toBe(oldRoot);
    expect(layer.children).toHaveLength(1);

    first.resolve(Texture.WHITE);
    await flushMicrotasks();
    expect(panel.targets("a")[0]!.children).toHaveLength(0);

    second.resolve(Texture.WHITE);
    await flushMicrotasks();
    expect(panel.targets("a")[0]!.children).toHaveLength(1);
  });

  it("lets a hide during the load window cancel the pending sprite", async () => {
    const deferred = deferredTexture();
    const panel = new CgItemPanel(
      new Container(),
      () => deferred.promise,
      tweenImmediately,
    );

    await panel.show(input("a"));
    expect(panel.targets("a")).toHaveLength(1);

    await panel.hide("a", 130, "Linear", true);
    expect(panel.targets("a")).toEqual([]);

    deferred.resolve(Texture.WHITE);
    await flushMicrotasks();
    expect(panel.targets("a")).toEqual([]);
  });

  it("warns and drops the pending registration when the texture is missing", async () => {
    const warnings: string[] = [];
    const panel = new CgItemPanel(
      new Container(),
      async () => null,
      tweenImmediately,
      (detail) => warnings.push(detail),
    );

    await panel.show(input("a"));
    await flushMicrotasks();

    expect(warnings[0]).toContain("cgitem asset is missing: a");
    expect(panel.targets("a")).toEqual([]);
  });
});
