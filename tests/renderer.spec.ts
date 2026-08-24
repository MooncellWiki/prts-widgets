import { Container, Texture, TilingSprite } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { PixiStoryRenderer } from "../src/widgets/StoryPlayer/engine/renderer";

import type { Context } from "../src/widgets/StoryPlayer/context";
import type { GridBackgroundInput } from "../src/widgets/StoryPlayer/engine/types";

function createContext(): Context {
  return {
    linkMap: {},
    script: [],
  };
}

function createGridBackgroundInput(): GridBackgroundInput {
  return {
    block: false,
    fadeMs: 0,
    imageKeys: ["l1", "r1", "l2", "r2"],
    scaleX: 0.5,
    scaleY: 0.75,
    solidHeights: [720, 720, 720, 720],
    solidWidths: [1280, 1280, 1280, 1280],
    x: -640,
    y: 320,
  };
}

function createCharacterRenderer(): any {
  const context: Context = {
    linkMap: {
      avg_test: {
        array: [
          { alias: "", group: -1, image: "body-1", name: "1$1" },
          { alias: "", group: -1, image: "body-2", name: "2$1" },
        ],
        groups: [],
        pos: { x: 0, y: 0 },
        size: { x: 100, y: 200 },
      },
    },
    script: [],
  };
  const renderer = new PixiStoryRenderer(context) as any;
  renderer.buildCharacterVisual = vi.fn(async () => ({
    sourceHeight: 200,
    sourceWidth: 100,
    visual: new Container(),
  }));
  renderer.tween = vi.fn(async () => {});
  return renderer;
}

describe("PixiStoryRenderer", () => {
  it("dims unfocused characters with tint without making them transparent", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = new Container();
    const visual = new Container();
    const state = {
      contentAlpha: 1,
      focusBrightness: 0.5,
      root,
      visual,
    };

    renderer.updateCharacterOpacity(state);

    expect(root.alpha).toBe(1);
    expect(visual.alpha).toBe(1);
    expect(visual.tint).toBe(0x80_80_80);
  });

  it("swaps expressions of the same native character without cross-fading", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });
    const previous = renderer.characterSlots.get("m");

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 150,
      expression: "2$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });

    const current = renderer.characterSlots.get("m");
    expect(renderer.tween).not.toHaveBeenCalled();
    expect(previous.root.parent).toBeNull();
    expect(current.expression).toBe("2$1");
    expect(current.root.alpha).toBe(1);
  });

  it("cross-fades when the native fade identity changes", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test$1",
      slot: "m",
    });
    const previous = renderer.characterSlots.get("m");

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 150,
      expression: "2$1",
      fadeIdentity: "avg_test$2",
      slot: "m",
    });

    // `_GetIdWithoutAliasOrIndex` keeps a standalone `$body`, so swapping the
    // body is a real character change: `dontFadeIfSameChar` must not suppress
    // the fade. The stubbed tween never completes, so the outgoing root is
    // still parented and the incoming one is still fully transparent.
    const current = renderer.characterSlots.get("m");
    expect(renderer.tween).toHaveBeenCalled();
    expect(previous.root.parent).not.toBeNull();
    expect(current.root.alpha).toBe(0);
  });

  it("keeps the large background behind the background regardless of update order", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const input = createGridBackgroundInput();

    renderer.app = {};
    renderer.backgroundLayer.addChild(renderer.gridBackgroundLayer);
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // panel_large_background is a permanent sibling in front of panel_background
    // in SceneCanvas, so it always renders underneath -- executing gridbg after
    // background must not lift the puzzle above it.
    await renderer.setGridBackground(input);
    expect(renderer.backgroundLayer.children.at(0)).toBe(
      renderer.gridBackgroundLayer,
    );

    await renderer.setBackground("bg_test");
    expect(renderer.backgroundLayer.children.at(0)).toBe(
      renderer.gridBackgroundLayer,
    );
    expect(renderer.backgroundLayer.children.at(-1)).toBe(
      renderer.backgroundRoot,
    );

    await renderer.setGridBackground(input);
    expect(renderer.backgroundLayer.children.at(0)).toBe(
      renderer.gridBackgroundLayer,
    );
    expect(renderer.backgroundLayer.children.at(-1)).toBe(
      renderer.backgroundRoot,
    );
  });

  it("draws a curtain as a solid body plus a fixed-width feather strip", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};

    const fills: unknown[] = [];
    const state = {
      alpha: 1,
      fill: 0.5,
      grad: true,
      graphic: {
        alpha: 1,
        clear: () => {},
        poly() {
          return this;
        },
        fill(style: unknown) {
          fills.push(style);
          return this;
        },
        visible: false,
      },
    };

    // direction 6 maps to a rightward sweep, so the inner edge is a vertical
    // line at x = 640 and the feather occupies x = 620..640.
    renderer.updateCurtainState(state, { x: 1, y: 0 });

    expect(state.graphic.visible).toBe(true);
    // Body is opaque black; only the strip carries the gradient.
    expect(fills[0]).toBe(0x00_00_00);
    expect(fills).toHaveLength(2);
    const gradient = fills[1] as any;
    expect(gradient.start).toEqual({ x: 620, y: 0 });
    expect(gradient.end).toEqual({ x: 640, y: 0 });
  });

  it("applies background transforms in a dedicated transform space", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setBackground("bg_test", {
      scaleX: 2.04,
      scaleY: 1.68,
      x: 24,
      y: -36,
    });

    expect(renderer.backgroundRoot.scale.x).toBe(2.04);
    expect(renderer.backgroundRoot.scale.y).toBe(1.68);
    expect(renderer.backgroundRoot.position.x).toBe(664);
    expect(renderer.backgroundRoot.position.y).toBe(396);
    expect(renderer.backgroundSprite.position.x).toBe(0);
    expect(renderer.backgroundSprite.position.y).toBe(0);
  });

  it("keeps the Unity background rect size when screenadapt is omitted", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setBackground("bg_festival_2");

    expect(renderer.backgroundSprite.width).toBe(1280);
    expect(renderer.backgroundSprite.height).toBe(720);
  });

  it("keeps an image at its asset size when screenadapt is omitted", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setImage("ac3_title1");

    expect(renderer.imageSprite.width).toBe(Texture.EMPTY.width);
    expect(renderer.imageSprite.height).toBe(Texture.EMPTY.height);
  });

  it("multiplies the native size by width/height before screenadapt", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // _LoadImage: SetNativeSize, then sizeDelta = (w * width, h * height)
    // with a 1.0 fallback, before any screenadapt step.
    await renderer.setImage("avg_5_boom", {
      block: false,
      fadeMs: 0,
      heightMultiplier: 0.5,
      scaleX: 1,
      scaleY: 1,
      tiled: false,
      widthMultiplier: 2,
      x: 0,
      y: 0,
    });

    expect(renderer.imageSprite.width).toBe(Texture.EMPTY.width * 2);
    expect(renderer.imageSprite.height).toBe(Texture.EMPTY.height * 0.5);
  });

  it("feeds the multiplied rect into the screenadapt aspect comparison", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // A square texture is taller than 16:9, but width=2 flips the multiplied
    // rect to 2:1, so showall must take the width-fit branch
    // (`_AdaptScreenShowAll`: target ratio > reference ratio → adapt width).
    await renderer.setImage("avg_5_boom", {
      block: false,
      fadeMs: 0,
      heightMultiplier: 1,
      scaleX: 1,
      scaleY: 1,
      screenAdapt: "showall",
      tiled: false,
      widthMultiplier: 2,
      x: 0,
      y: 0,
    });

    expect(renderer.imageSprite.width).toBe(1280);
    expect(renderer.imageSprite.height).toBe(
      (Texture.EMPTY.height * 1280) / (Texture.EMPTY.width * 2),
    );
  });

  it("takes the clear branch when the image texture fails to load", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);
    const clearImage = vi.spyOn(renderer, "clearImage");

    await renderer.setImage("first");
    expect(renderer.imageSprite).not.toBeNull();

    renderer.textureForImageKey = vi.fn().mockResolvedValue(null);
    await renderer.setImage("missing", {
      block: true,
      fadeMs: 0,
      scaleX: 1,
      scaleY: 1,
      tiled: false,
      x: 0,
      y: 0,
    });

    // _LoadImage on a null sprite logs the failure and fades the old image
    // out (clear branch) instead of keeping the previous image on screen.
    expect(clearImage).toHaveBeenCalledWith(0, true);
    expect(renderer.imageSprite).toBeNull();
    expect(renderer.imageLayer.children).toHaveLength(0);
  });

  it("renders a tiled image as a TilingSprite sized to the final rect", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setImage("bg_0_am", {
      block: false,
      fadeMs: 0,
      scaleX: 1,
      scaleY: 1,
      tiled: true,
      x: 0,
      y: 0,
    });

    expect(renderer.imageSprite).toBeInstanceOf(TilingSprite);
    // Image.type = Tiled with no multipliers/adapt tiles at the native size.
    expect(renderer.imageSprite.width).toBe(Texture.EMPTY.width);
    expect(renderer.imageSprite.height).toBe(Texture.EMPTY.height);

    await renderer.setImage("bg_0_am", {
      block: false,
      fadeMs: 0,
      scaleX: 1,
      scaleY: 1,
      screenAdapt: "fill",
      tiled: true,
      x: 0,
      y: 0,
    });

    // The tiling rect is the final sizeDelta (native x multipliers x adapt).
    expect(renderer.imageSprite.width).toBe(1280);
    expect(renderer.imageSprite.height).toBe(720);
  });

  it("keeps an in-flight imagerotate tween running across image swaps", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);
    const rotateSteps: Array<(progress: number) => void> = [];
    renderer.tween = vi.fn(
      async (_durationMs: number, step: (progress: number) => void) => {
        rotateSteps.push(step);
      },
    );

    // angle=90 without circles sweeps -270 degrees (AVGUtils.CreateRotateTween).
    await renderer.setImageRotate({
      angleDeg: 90,
      block: false,
      circles: 0,
      durationMs: 1000,
      inverse: false,
    });
    rotateSteps.at(-1)!(0.5);
    expect(renderer.imageLayer.angle).toBe(-135);

    // _ExecuteImage only DOKills the back Image, never the panel rotation
    // tween: the swap must neither freeze nor reset the rotation.
    await renderer.setImage("30_i04");
    rotateSteps.at(-1)!(1);
    expect(renderer.imageLayer.angle).toBe(-270);

    // The clear branch must not freeze it either.
    rotateSteps.at(-1)!(0.5);
    await renderer.clearImage();
    rotateSteps.at(-1)!(1);
    expect(renderer.imageLayer.angle).toBe(-270);
  });

  it("applies the strict gridbg xScale and yScale transform", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = renderer.buildGridBackgroundRoot(createGridBackgroundInput(), [
      Texture.EMPTY,
      Texture.EMPTY,
      Texture.EMPTY,
      Texture.EMPTY,
    ]);

    expect(root.scale.x).toBe(0.5);
    expect(root.scale.y).toBe(0.75);
  });

  it("builds verticalbg as a single-column stacked background", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["v1", "v2", "v3"],
        layout: "vertical",
        solidHeights: [720, 720, 625],
        solidWidths: [1280],
        y: 540,
      },
      [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY],
    );

    expect(root.children).toHaveLength(3);
    expect(root.position.x).toBe(0);
    expect(root.position.y).toBe(-180);
    expect(root.pivot.x).toBe(640);
    expect(root.pivot.y).toBe(720);
    expect(root.scale.x).toBe(0.5);
    expect(root.scale.y).toBe(0.75);
  });

  it("stacks verticalbg tiles from top to bottom", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const textures = [
      new Texture({ label: "tile-0" }),
      new Texture({ label: "tile-1" }),
      new Texture({ label: "tile-2" }),
      new Texture({ label: "tile-3" }),
    ];
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1", "tile-2", "tile-3"],
        layout: "vertical",
        solidHeights: [360, 360, 360, 360],
        solidWidths: [640],
        x: 0,
        y: 0,
      },
      textures,
    );

    expect(root.children).toHaveLength(4);
    expect(
      root.children.map((child: any) => ({
        label: child.texture.label,
        x: child.position.x,
        y: child.position.y,
      })),
    ).toEqual([
      { label: "tile-0", x: 0, y: 0 },
      { label: "tile-1", x: 0, y: 360 },
      { label: "tile-2", x: 0, y: 720 },
      { label: "tile-3", x: 0, y: 1080 },
    ]);
  });

  it("lays out largebg as exactly two horizontal tiles", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const textures = [
      new Texture({ label: "tile-0" }),
      new Texture({ label: "tile-1" }),
    ];
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        layout: "large",
        solidHeights: [360],
        solidWidths: [640, 640],
        x: 0,
        y: 0,
      },
      textures,
    );

    expect(root.children).toHaveLength(2);
    expect(
      root.children.map((child: any) => ({
        label: child.texture.label,
        x: child.position.x,
        y: child.position.y,
      })),
    ).toEqual([
      { label: "tile-0", x: 0, y: 0 },
      { label: "tile-1", x: 640, y: 0 },
    ]);
  });

  it("applies largebgtween in largebg transform space", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        initPositionMode: "default",
        layout: "large",
        solidHeights: [720],
        solidWidths: [920, 920],
        x: -180,
        y: 0,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    const snapshots: Array<{
      scaleX: number;
      scaleY: number;
      x: number;
      y: number;
    }> = [];

    expect(root.position.y).toBe(360);
    renderer.app = {};
    renderer.gridBackgroundLayer.addChild(root);
    renderer.largeBackgroundRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        snapshots.push(renderer.readCenteredTransform(root));
        step(0.5);
        snapshots.push(renderer.readCenteredTransform(root));
        done?.();
        snapshots.push(renderer.readCenteredTransform(root));
      },
    );

    await renderer.setLargeBackgroundTween({
      block: true,
      durationMs: 1000,
      xFrom: -180,
      xScaleFrom: 1.2,
      xScaleTo: 0.8,
      xTo: -720,
      yFrom: 0,
      yScaleFrom: 1.2,
      yScaleTo: 0.6,
      yTo: 360,
    });

    expect(snapshots).toEqual([
      { scaleX: 1.2, scaleY: 1.2, x: -180, y: 0 },
      { scaleX: 1, scaleY: 0.899_999_999_999_999_9, x: -450, y: 180 },
      { scaleX: 0.8, scaleY: 0.6, x: -720, y: 360 },
    ]);
    // Native default initposmode keeps its +width[1]/2 parent offset while
    // largebgtween moves only the child offset transform.
    expect(root.position.x).toBe(380);
  });

  it("applies backgroundtween in background transform space", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = new Texture({ label: "bg-test" });
    const snapshots: Array<{
      scaleX: number;
      scaleY: number;
      x: number;
      y: number;
    }> = [];

    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(root);
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        snapshots.push({
          scaleX: renderer.backgroundRoot.scale.x,
          scaleY: renderer.backgroundRoot.scale.y,
          x: renderer.backgroundRoot.position.x - 640,
          y: 360 - renderer.backgroundRoot.position.y,
        });
        step(0.5);
        snapshots.push({
          scaleX: renderer.backgroundRoot.scale.x,
          scaleY: renderer.backgroundRoot.scale.y,
          x: renderer.backgroundRoot.position.x - 640,
          y: 360 - renderer.backgroundRoot.position.y,
        });
        done?.();
        snapshots.push({
          scaleX: renderer.backgroundRoot.scale.x,
          scaleY: renderer.backgroundRoot.scale.y,
          x: renderer.backgroundRoot.position.x - 640,
          y: 360 - renderer.backgroundRoot.position.y,
        });
      },
    );

    await renderer.setBackground("bg_test", {
      scaleX: 2.04,
      scaleY: 1.68,
      x: 24,
      y: -36,
    });
    await renderer.setBackgroundTween({
      block: true,
      durationMs: 1000,
      xFrom: 24,
      xScaleFrom: 2.04,
      xScaleTo: 1.3,
      xTo: -120,
      yFrom: -36,
      yScaleFrom: 1.68,
      yScaleTo: 1.1,
      yTo: 80,
    });

    expect(snapshots).toEqual([
      { scaleX: 2.04, scaleY: 1.68, x: 24, y: -36 },
      { scaleX: 1.67, scaleY: 1.390_000_000_000_000_1, x: -48, y: 22 },
      { scaleX: 1.3, scaleY: 1.1, x: -120, y: 80 },
    ]);
  });

  it("applies largeimgtween in largeimg transform space", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        layout: "large",
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    const snapshots: Array<{
      scaleX: number;
      scaleY: number;
      x: number;
      y: number;
    }> = [];

    renderer.app = {};
    renderer.imageLayer.addChild(root);
    renderer.largeImageRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        snapshots.push({
          scaleX: root.scale.x,
          scaleY: root.scale.y,
          x: root.position.x - 640,
          y: 360 - root.position.y,
        });
        step(0.5);
        snapshots.push({
          scaleX: root.scale.x,
          scaleY: root.scale.y,
          x: root.position.x - 640,
          y: 360 - root.position.y,
        });
        done?.();
        snapshots.push({
          scaleX: root.scale.x,
          scaleY: root.scale.y,
          x: root.position.x - 640,
          y: 360 - root.position.y,
        });
      },
    );

    await renderer.setLargeImageTween({
      block: true,
      durationMs: 1000,
      xFrom: -160,
      xScaleFrom: 1.2,
      xScaleTo: 0.8,
      xTo: -720,
      yFrom: 0,
      yScaleFrom: 1.2,
      yScaleTo: 0.6,
      yTo: 360,
    });

    expect(snapshots).toEqual([
      { scaleX: 1.2, scaleY: 1.2, x: -160, y: 0 },
      { scaleX: 1, scaleY: 0.899_999_999_999_999_9, x: -440, y: 180 },
      { scaleX: 0.8, scaleY: 0.6, x: -720, y: 360 },
    ]);
  });

  it("applies zero-duration largeimgtween immediately and cancels stale tweens", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        layout: "large",
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    let pendingStep: ((progress: number) => void) | null = null;
    let pendingDone: (() => void) | null = null;

    renderer.app = {};
    renderer.imageLayer.addChild(root);
    renderer.largeImageRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        pendingStep = step;
        pendingDone = done ?? null;
      },
    );

    await renderer.setLargeImageTween({
      block: false,
      durationMs: 1000,
      xFrom: -160,
      xTo: -720,
      yFrom: 0,
      yTo: 0,
    });

    const applySpy = vi.spyOn(renderer, "applyCenteredTransform");

    await renderer.setLargeImageTween({
      block: true,
      durationMs: 0,
      xFrom: -320,
    });

    expect(applySpy.mock.calls).toEqual([
      [root, { scaleX: 0.5, scaleY: 0.75, x: -320, y: 0 }],
      [root, { scaleX: 0.5, scaleY: 0.75, x: -160, y: 0 }],
    ]);

    (pendingStep as ((progress: number) => void) | null)?.(1);
    (pendingDone as (() => void) | null)?.();

    expect(root.position.x - 640).toBe(-160);
    expect(360 - root.position.y).toBe(0);
  });
});
