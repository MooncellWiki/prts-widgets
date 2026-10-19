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

// Manual tween driver: index-ordered steps advanced by the test.
function manualTweenSteps() {
  const steps: Array<{
    complete: () => void;
    resolve: () => void;
    update: (progress: number) => void;
  }> = [];
  const tween = (
    _durationMs: number,
    update: (progress: number) => void,
    complete?: () => void,
  ): Promise<void> =>
    new Promise((resolve) => {
      steps.push({
        complete: complete ?? ((): void => {}),
        resolve,
        update,
      });
    });
  return { steps, tween };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index++) await Promise.resolve();
}

describe("CgItemPanel", () => {
  it("keeps different keys and replaces an equal key with a new root", async () => {
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

  it("hides one key, then clears every remaining key", async () => {
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

  it("eases along the named DOTween curve and falls back to Linear for unknown names", async () => {
    // `AVGShowItemCgSlot.Show` (2.7.81 0x18405dde0) reads ease via
    // `GetEnum<Ease>(param, "ease", (Ease)1, ignoreCase: false)`; DOTween's
    // enum is `Unset = 0, Linear = 1, InSine = 2`, so the default and the
    // rejected-name fallback are both Linear.
    const inSineHalf = 100 * (1 - Math.SQRT1_2);
    const cases = [
      { ease: "Linear", expected: 50 },
      { ease: "InSine", expected: inSineHalf },
      { ease: "NoSuchEase", expected: 50 },
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

  it("fades with the native InSine default curve, not linearly", async () => {
    const layer = new Container();
    const { steps, tween } = manualTweenSteps();
    const panel = new CgItemPanel(layer, async () => Texture.WHITE, tween);
    await panel.show(input("a"));
    const root = panel.targets("a")[0];

    void panel.hide("a", 500, "InSine", false);
    // InSine(0.5) = 1 - cos(pi/4), so the remaining alpha is cos(pi/4).
    steps[0].update(0.5);
    expect(root.alpha).toBeCloseTo(Math.cos(Math.PI / 4), 5);
    steps[0].update(1);
    expect(root.alpha).toBeCloseTo(0, 5);
  });

  it("keeps driving the show tween while a single-key hide fades", async () => {
    const layer = new Container();
    const { steps, tween } = manualTweenSteps();
    const panel = new CgItemPanel(layer, async () => Texture.WHITE, tween);
    await panel.show(
      input("a", {
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 100, y: 0 },
        positionDurationMs: 1000,
      }),
    );
    // block=false returns before the mock loader settles; flush so the
    // sprite exists and the show tween is registered.
    await flushMicrotasks();
    const sprite = panel.targets("a")[0].children[0] as Sprite;
    steps[0].update(0.25);
    expect(sprite.position.x).toBe(25);

    // Native `AVGShowItemCgSlot.Hide` has no DOKill: the show sequence keeps
    // driving the slot while the fade runs.
    void panel.hide("a", 500, "Linear", false);
    steps[0].update(0.5);
    expect(sprite.position.x).toBe(50);

    steps[1].update(1);
    steps[1].complete();
    expect(panel.targets("a")).toEqual([]);
    // dispose() bumped the session: a late show-side tick must not touch the
    // destroyed sprite (Pixi v8 nulls `position` on destroy, so a surviving
    // write would throw).
    expect(() => steps[0].update(0.75)).not.toThrow();
  });

  it("single-key hide does not dispose a slot replaced mid-fade", async () => {
    const layer = new Container();
    const { steps, tween } = manualTweenSteps();
    const panel = new CgItemPanel(layer, async () => Texture.WHITE, tween);
    await panel.show(input("a"));
    const oldRoot = panel.targets("a")[0];

    void panel.hide("a", 500, "Linear", false);
    await panel.show(input("a"));
    const newRoot = panel.targets("a")[0];
    expect(newRoot).not.toBe(oldRoot);

    steps[0].update(1);
    steps[0].complete();
    expect(panel.targets("a")).toEqual([newRoot]);
    expect(layer.children).toContain(newRoot);
  });

  it("clear-all keeps driving during the fade and stops after destroy", async () => {
    const layer = new Container();
    const { steps, tween } = manualTweenSteps();
    const panel = new CgItemPanel(layer, async () => Texture.WHITE, tween);
    await panel.show(
      input("a", {
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 100, y: 0 },
        positionDurationMs: 1000,
      }),
    );
    await flushMicrotasks();
    const sprite = panel.targets("a")[0].children[0] as Sprite;
    steps[0].update(0.5);
    expect(sprite.position.x).toBe(50);

    await panel.hide(undefined, 500, "Linear", false);
    steps[0].update(0.75);
    // Native keeps driving the removed slots until Dispose destroys them.
    expect(sprite.position.x).toBe(75);

    steps[1].update(1);
    steps[1].complete();
    // The fade completion bumped the session: further show-side ticks must
  });
});
