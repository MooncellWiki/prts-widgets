import { Container, Texture, type Sprite } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { LayerGraph } from "../src/widgets/StoryPlayer/engine/rendering/core/LayerGraph";
import { CgItemView } from "../src/widgets/StoryPlayer/engine/rendering/panels/CgItemView";

import type { TweenRunOptions } from "../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
import type {
  CgItemInput,
  CgItemShakeInput,
} from "../src/widgets/StoryPlayer/engine/types";

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
    layer: 0,
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

function shakeInput(
  key: string,
  overrides: Partial<CgItemShakeInput> = {},
): CgItemShakeInput {
  return {
    block: false,
    durationMs: 1000,
    fadeOut: false,
    infinite: false,
    key,
    randomness: 0,
    vibrato: 2,
    xStrength: 0,
    yStrength: 20,
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
    options?: TweenRunOptions;
    resolve: () => void;
    update: (progress: number) => void;
  }> = [];
  const tween = (
    _durationMs: number,
    update: (progress: number) => void,
    complete?: () => void,
    options?: TweenRunOptions,
  ): Promise<void> =>
    new Promise((resolve) => {
      steps.push({
        complete: complete ?? ((): void => {}),
        options,
        resolve,
        update,
      });
    });
  return { steps, tween };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index++) await Promise.resolve();
}

describe("CgItemView", () => {
  it("keeps different keys and replaces an equal key with a new root", async () => {
    const layer = new Container();
    const view = new CgItemView(
      layer,
      async () => Texture.WHITE,
      tweenImmediately,
    );

    await view.show(input("a"));
    const oldA = view.targets("a")[0];
    await view.show(input("b"));
    await view.show(
      input("a", {
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 10, y: 20 },
      }),
    );

    expect(view.targets("a")).toHaveLength(1);
    expect(view.targets("b")).toHaveLength(1);
    const newA = view.targets("a")[0]!;
    expect(newA).not.toBe(oldA);
    expect(newA.children[0]!.x).toBe(10);
    expect(newA.children[0]!.y).toBe(-20);
    expect(layer.children).toHaveLength(2);
  });

  it("converts Unity Y at the start and throughout a position tween", async () => {
    const manual = manualTween();
    const view = new CgItemView(
      new Container(),
      async () => Texture.WHITE,
      manual.tween,
    );
    await view.show(
      input("a", {
        positionDurationMs: 400,
        positionFrom: { x: 80, y: -500 },
        positionTo: { x: 80, y: -250 },
      }),
    );
    await flushMicrotasks();
    const root = view.targets("a")[0]!;
    const sprite = root.children[0]!;

    expect(root.y + sprite.y).toBe(860);
    manual.step(0.5);
    expect(root.y + sprite.y).toBe(735);
    manual.step(1);
    expect(root.y + sprite.y).toBe(610);
  });

  it("sorts CGs with the scene canvases while preserving their transform parents", async () => {
    const stage = new Container();
    const layers = new LayerGraph();
    layers.attach(stage);
    const view = new CgItemView(
      layers.cgItems,
      async () => Texture.WHITE,
      tweenImmediately,
    );
    await view.show(input("first", { layer: 4 }));
    await view.show(input("second", { layer: 3 }));
    await view.show(input("third", { layer: 2 }));
    await view.show(input("default"));
    await view.show(input("sameAsCutin", { layer: 1 }));
    await view.show(input("last", { layer: 4 }));

    layers.sceneDraw.sortRenderLayerChildren();
    const order = layers.sceneDraw.renderLayerChildren;
    const index = (key: string) => order.indexOf(view.targets(key)[0]!);
    expect(index("default")).toBeLessThan(order.indexOf(layers.cutins));
    expect(index("sameAsCutin")).toBeGreaterThan(order.indexOf(layers.cutins));
    expect(index("third")).toBeLessThan(index("second"));
    expect(index("second")).toBeLessThan(index("first"));
    expect(index("first")).toBeLessThan(index("last"));
    layers.scene.position.set(20, 30);
    expect(layers.cutins.toGlobal({ x: 0, y: 0 })).toMatchObject({
      x: 20,
      y: 30,
    });
    const last = view.targets("last")[0]!;
    expect(last.toGlobal({ x: 0, y: 0 })).toMatchObject({ x: 640, y: 360 });

    await view.hide("last", 0, "Linear", true);
    expect(order).not.toContain(last);
  });

  it("converts Unity rotation at both ends and takes the shortest Fast arc", async () => {
    const manual = manualTween();
    const view = new CgItemView(
      new Container(),
      async () => Texture.WHITE,
      manual.tween,
    );
    await view.show(input("static", { rotationFrom: -5, rotationTo: -5 }));
    expect(view.targets("static")[0]!.children[0]!.angle).toBeCloseTo(5);
    await view.show(
      input("moving", {
        rotationDurationMs: 2000,
        rotationFrom: -350,
        rotationTo: -10,
      }),
    );
    const image = view.targets("moving")[0]!.children[0]!;
    expect(image.angle).toBeCloseTo(350);
    manual.step(0.5);
    expect(image.angle).toBeCloseTo(360);
    manual.step(1);
    expect(image.angle).toBeCloseTo(370);
  });

  it("multiplies explicit width and height by the scale track", async () => {
    const manual = manualTween();
    const view = new CgItemView(
      new Container(),
      async () => Texture.WHITE,
      manual.tween,
    );
    await view.show(
      input("a", {
        height: 100,
        scaleDurationMs: 1000,
        scaleTo: 2,
        width: 200,
      }),
    );
    const image = view.targets("a")[0]!.children[0]!;
    expect([image.width, image.height]).toEqual([200, 100]);
    manual.step(0.5);
    expect([image.width, image.height]).toEqual([300, 150]);
    manual.step(1);
    expect([image.width, image.height]).toEqual([400, 200]);
  });

  it("shows the white blocker immediately while its alpha still animates", async () => {
    const { steps, tween } = manualTweenSteps();
    const load = vi.fn(async () => Texture.WHITE);
    const layer = new Container();
    const view = new CgItemView(layer, load, tween);

    await view.show(
      input("cover", {
        alphaDurationMs: 1000,
        alphaFrom: 0,
        assetKey: undefined,
        block: true,
      }),
    );
    const image = view.targets("cover")[0]!.children[0]!;
    const sprite = image.children[0] as Sprite;
    expect(load).not.toHaveBeenCalled();
    expect(sprite.texture).toBe(Texture.WHITE);
    expect([image.width, image.height]).toEqual([1280, 720]);
    expect(sprite.alpha).toBe(0);
    steps[0]!.update(0.5);
    expect(sprite.alpha).toBe(0.5);

    await view.show(input("", { assetKey: undefined }));
    expect(view.targets("")).toEqual([]);
    await view.hide(undefined, 0, "Linear", true);
    steps[1]!.complete();
    expect(layer.children).toHaveLength(1);
    view.clear();
    expect(layer.children).toHaveLength(0);
  });

  it("shakes the slot root, replaces its loop and settles it on hide", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.25);
    const { steps, tween } = manualTweenSteps();
    const view = new CgItemView(
      new Container(),
      async () => Texture.WHITE,
      tween,
    );
    try {
      await view.show(
        input("a", {
          positionFrom: { x: 0, y: 0 },
          positionTo: { x: 30, y: 20 },
        }),
      );
      const root = view.targets("a")[0]!;
      const image = root.children[0]!;
      const first = view.shake(
        shakeInput("a", { block: true, infinite: true }),
      );
      const original = steps[0]!;
      expect(original.options?.loops).toBe(-1);
      original.update(0.5);
      expect(root.y).toBeCloseTo(340);
      expect(image.position).toMatchObject({ x: 30, y: -20 });

      const second = view.shake(shakeInput("a", { block: true }));
      await first;
      expect(original.options?.isAlive?.()).toBe(false);
      original.complete();
      expect(steps[1]!.options?.isAlive?.()).toBe(true);
      steps[1]!.update(0.5);
      expect(root.y).toBeCloseTo(320);

      await view.hide("a", 100, "Linear", false);
      await second;
      expect(root.y).toBe(360);
      steps[1]!.update(0.5);
      expect(root.y).toBe(360);
      expect(view.targets("a")).toEqual([root]);
      steps[2]!.complete();
      expect(view.targets("a")).toEqual([]);
    } finally {
      random.mockRestore();
      view.destroy();
    }
  });

  it("stops only the requested root or every root before clear-all", async () => {
    const { steps, tween } = manualTweenSteps();
    const view = new CgItemView(
      new Container(),
      async () => Texture.WHITE,
      tween,
    );
    await view.show(input("a"));
    await view.show(input("b"));
    const a = view.targets("a")[0]!;
    const b = view.targets("b")[0]!;
    await view.shake(shakeInput("a"));
    await view.shake(shakeInput("b"));
    steps[0]!.update(0.5);
    steps[1]!.update(0.5);
    view.stopShakes("a");
    expect(a.position).toMatchObject({ x: 640, y: 360 });
    expect(steps[0]!.options?.isAlive?.()).toBe(false);
    expect(steps[1]!.options?.isAlive?.()).toBe(true);

    await view.hide(undefined, 100, "Linear", true);
    expect(b.position).toMatchObject({ x: 640, y: 360 });
    expect(steps[1]!.options?.isAlive?.()).toBe(false);
    view.clear();
  });

  it("hides one key, then clears every remaining key", async () => {
    const layer = new Container();
    const view = new CgItemView(
      layer,
      async () => Texture.WHITE,
      tweenImmediately,
    );
    await view.show(input("a"));
    await view.show(input("b"));

    await view.hide("a", 130, "Linear", true);
    expect(view.targets("a")).toEqual([]);
    expect(view.targets("b")).toHaveLength(1);

    await view.hide(undefined, 130, "Linear", true);
    expect(view.targets("")).toEqual([]);
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
      const view = new CgItemView(
        new Container(),
        async () => Texture.WHITE,
        manual.tween,
      );
      await view.show(
        input("a", {
          ease,
          positionDurationMs: 1000,
          positionFrom: { x: 0, y: 0 },
          positionTo: { x: 100, y: 0 },
        }),
      );
      await flushMicrotasks();
      manual.step(0.5);
      const image = view.targets("a")[0]!.children[0]!;
      expect(image.position.x).toBeCloseTo(expected, 5);
    }
  });

  it("returns from a non-blocking show before the texture arrives", async () => {
    const layer = new Container();
    const deferred = deferredTexture();
    const view = new CgItemView(
      layer,
      () => deferred.promise,
      tweenImmediately,
    );

    let finished = false;
    const task = view.show(input("a")).then(() => {
      finished = true;
    });
    await flushMicrotasks();

    expect(finished).toBe(true);
    expect(view.targets("a")).toHaveLength(1);
    expect(view.targets("a")[0]!.children).toHaveLength(0);

    deferred.resolve(Texture.WHITE);
    await flushMicrotasks();
    expect(view.targets("a")[0]!.children).toHaveLength(1);
    await task;
  });

  it("disposes the previous same-key entry before the new texture loads", async () => {
    const layer = new Container();
    const first = deferredTexture();
    const second = deferredTexture();
    let loader = () => first.promise;
    const view = new CgItemView(layer, () => loader(), tweenImmediately);

    await view.show(input("a"));
    await flushMicrotasks();
    const oldRoot = view.targets("a")[0]!;

    loader = () => second.promise;
    await view.show(input("a"));

    expect(view.targets("a")[0]).not.toBe(oldRoot);
    expect(layer.children).toHaveLength(1);

    first.resolve(Texture.WHITE);
    await flushMicrotasks();
    expect(view.targets("a")[0]!.children).toHaveLength(0);

    second.resolve(Texture.WHITE);
    await flushMicrotasks();
    expect(view.targets("a")[0]!.children).toHaveLength(1);
  });

  it("lets a hide during the load window cancel the pending sprite", async () => {
    const deferred = deferredTexture();
    const view = new CgItemView(
      new Container(),
      () => deferred.promise,
      tweenImmediately,
    );

    await view.show(input("a"));
    expect(view.targets("a")).toHaveLength(1);

    await view.hide("a", 130, "Linear", true);
    expect(view.targets("a")).toEqual([]);

    deferred.resolve(Texture.WHITE);
    await flushMicrotasks();
    expect(view.targets("a")).toEqual([]);
  });

  it("warns and drops the pending registration when the texture is missing", async () => {
    const warnings: string[] = [];
    const view = new CgItemView(
      new Container(),
      async () => null,
      tweenImmediately,
      (detail) => warnings.push(detail),
    );

    await view.show(input("a"));
    await flushMicrotasks();

    expect(warnings[0]).toContain("cgitem asset is missing: a");
    expect(view.targets("a")).toEqual([]);
  });

  it("fades along the requested DOTween curve", async () => {
    // runtime.ts passes the native `(Ease)1` = Linear default; an explicit
    // name such as InSine (1 - cos(pi/4) at the midpoint) is honoured.
    const cases = [
      { ease: "Linear", expected: 0.5 },
      { ease: "InSine", expected: Math.cos(Math.PI / 4) },
    ];
    for (const { ease, expected } of cases) {
      const layer = new Container();
      const { steps, tween } = manualTweenSteps();
      const view = new CgItemView(layer, async () => Texture.WHITE, tween);
      await view.show(input("a"));
      const root = view.targets("a")[0];

      void view.hide("a", 500, ease, false);
      steps[0].update(0.5);
      expect(root.alpha).toBeCloseTo(expected, 5);
      steps[0].update(1);
      expect(root.alpha).toBeCloseTo(0, 5);
    }
  });

  it("keeps driving the show tween while a single-key hide fades", async () => {
    const layer = new Container();
    const { steps, tween } = manualTweenSteps();
    const view = new CgItemView(layer, async () => Texture.WHITE, tween);
    await view.show(
      input("a", {
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 100, y: 0 },
        positionDurationMs: 1000,
      }),
    );
    // block=false returns before the mock loader settles; flush so the
    // sprite exists and the show tween is registered.
    await flushMicrotasks();
    const sprite = view.targets("a")[0].children[0]!;
    steps[0].update(0.25);
    expect(sprite.position.x).toBe(25);

    // Native `AVGShowItemCgSlot.Hide` has no DOKill: the show sequence keeps
    // driving the slot while the fade runs.
    void view.hide("a", 500, "Linear", false);
    steps[0].update(0.5);
    expect(sprite.position.x).toBe(50);

    steps[1].update(1);
    steps[1].complete();
    expect(view.targets("a")).toEqual([]);
    // dispose() bumped the session: a late show-side tick must not touch the
    // destroyed sprite (Pixi v8 nulls `position` on destroy, so a surviving
    // write would throw).
    expect(() => steps[0].update(0.75)).not.toThrow();
  });

  it("single-key hide does not dispose a slot replaced mid-fade", async () => {
    const layer = new Container();
    const { steps, tween } = manualTweenSteps();
    const view = new CgItemView(layer, async () => Texture.WHITE, tween);
    await view.show(input("a"));
    const oldRoot = view.targets("a")[0];

    void view.hide("a", 500, "Linear", false);
    await view.show(input("a"));
    const newRoot = view.targets("a")[0];
    expect(newRoot).not.toBe(oldRoot);

    steps[0].update(1);
    steps[0].complete();
    expect(view.targets("a")).toEqual([newRoot]);
    expect(layer.children).toContain(newRoot);
  });

  it("lets the latest hide on a key own the dispose, like native's anim epoch", async () => {
    // `AVGShowItemCgSlot.Hide` re-binds `_onAnimEnd` and bumps `m_animEpoch`
    // via `_MakeAnimEndCb`, so the first fade's completion is inert and the
    // slot goes away when the second fade ends.
    const layer = new Container();
    const { steps, tween } = manualTweenSteps();
    const view = new CgItemView(layer, async () => Texture.WHITE, tween);
    await view.show(input("a"));

    void view.hide("a", 1000, "Linear", false);
    void view.hide("a", 2000, "Linear", false);
    steps[0].update(1);
    steps[0].complete();
    expect(view.targets("a")).toHaveLength(1);

    steps[1].update(1);
    steps[1].complete();
    expect(view.targets("a")).toEqual([]);
    expect(layer.children).toHaveLength(0);
  });

  it("mutes a keyed hide superseded by clear-all so it cannot dispose a re-shown key", async () => {
    const layer = new Container();
    const { steps, tween } = manualTweenSteps();
    const view = new CgItemView(layer, async () => Texture.WHITE, tween);
    await view.show(input("a"));
    const old = view.targets("a")[0];

    void view.hide("a", 500, "Linear", false);
    await view.hide(undefined, 1000, "Linear", false);
    await view.show(input("a"));
    const fresh = view.targets("a")[0];

    steps[0].update(1);
    steps[0].complete();
    // The old slot is still fading under clear-all (registered until its
    // own fade-end dispose); the muted keyed hide touched neither.
    expect(view.targets("a")).toEqual([fresh, old]);
    expect(layer.children).toContain(fresh);

    steps[1].update(1);
    steps[1].complete();
    expect(view.targets("a")).toEqual([fresh]);
    expect(layer.children).toEqual([fresh]);
  });

  it("clear-all keeps driving during the fade and stops after destroy", async () => {
    const layer = new Container();
    const { steps, tween } = manualTweenSteps();
    const view = new CgItemView(layer, async () => Texture.WHITE, tween);
    await view.show(
      input("a", {
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 100, y: 0 },
        positionDurationMs: 1000,
      }),
    );
    await flushMicrotasks();
    const sprite = view.targets("a")[0].children[0]!;
    steps[0].update(0.5);
    expect(sprite.position.x).toBe(50);

    await view.hide(undefined, 500, "Linear", false);
    steps[0].update(0.75);
    // Native keeps driving the removed slots until Dispose destroys them.
    expect(sprite.position.x).toBe(75);

    steps[1].update(1);
    steps[1].complete();
    expect(layer.children).toHaveLength(0);
    // The fade completion bumped the session: further show-side ticks must
    // not touch the destroyed sprite (Pixi v8 nulls `position` on destroy).
    expect(() => steps[0].update(1)).not.toThrow();
  });

  it("reports PostDisplay registration and disposal per key", async () => {
    const layer = new Container();
    const events: string[] = [];
    const { steps, tween } = manualTweenSteps();
    const view = new CgItemView(
      layer,
      async () => Texture.WHITE,
      tween,
      undefined,
      {
        disposed: (key) => events.push(`disposed:${key}`),
        registered: (key) => events.push(`registered:${key}`),
      },
    );

    // `_ShowItem` disposes the previous same-key slot before binding the new
    // one, so a re-show reports both, in that order.
    await view.show(input("a"));
    await view.show(input("a"));
    expect(events).toEqual(["registered:a", "disposed:a", "registered:a"]);

    // A keyed hide disposes only when its fade completes.
    events.length = 0;
    void view.hide("a", 100, "Linear", false);
    expect(events).toEqual([]);
    steps.at(-1)!.complete();
    expect(events).toEqual(["disposed:a"]);
  });

  it("keeps clear-all slots as targets until their fade-end dispose", async () => {
    const layer = new Container();
    const events: string[] = [];
    const { steps, tween } = manualTweenSteps();
    const view = new CgItemView(
      layer,
      async () => Texture.WHITE,
      tween,
      undefined,
      {
        disposed: (key) => events.push(`disposed:${key}`),
        registered: (key) => events.push(`registered:${key}`),
      },
    );
    await view.show(input("a"));
    await view.show(input("b"));
    const oldA = view.targets("a")[0];
    events.length = 0;

    // `_ClearAllItems` finishes even with block=true while the slots stay
    // registered as PostDisplay items until their individual fades end.
    await view.hide(undefined, 100, "Linear", true);
    const [fadeA, fadeB] = steps.slice(-2);
    expect(view.targets("a")).toEqual([oldA]);
    expect(view.targets("b")).toHaveLength(1);

    // A same-key show during the fade registers alongside the fading slot.
    await view.show(input("a"));
    expect(view.targets("a")).toHaveLength(2);

    fadeB.complete();
    expect(view.targets("b")).toEqual([]);
    fadeA.complete();
    expect(view.targets("a")).toHaveLength(1);
    expect(view.targets("a")[0]).not.toBe(oldA);
    expect(events).toEqual(["registered:a", "disposed:b", "disposed:a"]);
  });
});
