import { type Container, type Sprite, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { buildGridBackgroundRoot } from "../../../src/widgets/StoryPlayer/engine/rendering/core/SceneGeometry";
import {
  createContext,
  createRenderedPlayback,
  createRenderer,
  focusAmount,
} from "../helpers/rendererFixtures";

import type { ExecutionHandle } from "../../../src/widgets/StoryPlayer/engine/execution";
import type { GridBackgroundInput } from "../../../src/widgets/StoryPlayer/engine/types";

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

describe("PixiStoryRenderer", () => {
  it.each([
    {
      action: "replace",
      apply: (renderer: ReturnType<typeof createRenderer>) =>
        renderer.setGridBackground({
          ...createGridBackgroundInput(),
          imageKeys: ["new"],
        }),
      labels: ["replacement"],
    },
    {
      action: "destroy",
      apply: (renderer: ReturnType<typeof createRenderer>) =>
        renderer.destroy(),
      labels: [],
    },
  ])("retires a pending tile load on $action", async ({ apply, labels }) => {
    const renderer = createRenderer();
    renderer.app = { destroy: vi.fn() };
    const layer: Container = renderer.layers.gridBackground;
    const pending = Promise.withResolvers<Texture>();
    const replacement = new Texture({ label: "replacement" });
    renderer.textureForImageKey = vi
      .fn()
      .mockReturnValue(replacement)
      .mockReturnValueOnce(pending.promise);
    const input = createGridBackgroundInput();
    const loading: ExecutionHandle = renderer.setGridBackground(input);
    expect(layer.children).toHaveLength(0);

    apply(renderer);
    expect(loading.endReason).toBe("reset");
    const mounted = [...layer.children];
    expect(
      mounted.map((root) => (root.children[0] as Sprite).texture.label),
    ).toEqual(labels);

    pending.resolve(new Texture({ label: "late art" }));
    await Promise.resolve();
    await Promise.resolve();
    expect(layer.children).toEqual(mounted);
    renderer.destroy();
  });

  it("fades legacy foreground puzzles and clears only roots belonging to that view", async () => {
    const renderer = createRenderer();
    renderer.app = { destroy: vi.fn() };
    renderer.frames.manual = true;
    const { gridBackground, images } = renderer.layers;
    const texture = new Texture({ label: "shared" });
    renderer.textureForImageKey = vi.fn().mockReturnValue(texture);
    const input = createGridBackgroundInput();
    await renderer.setImage("ordinary");
    renderer.setGridBackground(input);
    renderer.setLargeImage(input);
    const [ordinary, previous] = images.children;
    const [background] = gridBackground.children;
    renderer.setLargeImage({ ...input, fadeMs: 32 });
    const [, , incoming] = images.children;
    expect(incoming.scale.x).toBe(1.2);
    try {
      renderer.frames.step(16);
      expect(images.children).toEqual([ordinary, previous, incoming]);
      expect(incoming.alpha).toBe(0.5);
      renderer.frames.step(16);
      expect(images.children).toEqual([ordinary, incoming]);
      expect(previous.destroyed).toBe(true);
      renderer.clearLargeImage();
      expect(images.children).toEqual([ordinary]);
      expect(gridBackground.children).toEqual([background]);
      expect(texture.destroyed).toBe(false);
    } finally {
      renderer.destroy();
    }
  });

  it("keeps lbg focus applied when a puzzle is first loaded or replaced", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);
    const layer = renderer.layers.gridBackground;

    renderer.setFocusParam({ blur: false, color: "Colorinverse" });
    renderer.setFocusOut({
      block: false,
      durationMs: 0,
      id: "",
      to: 1,
      type: "lbg",
    });
    await renderer.setGridBackground(createGridBackgroundInput())?.completion;
    expect(layer.children).toHaveLength(1);
    const first = layer.children[0];
    const firstTiles: Container[] = [...first.children];
    expect(
      firstTiles.map((tile) => focusAmount(renderer.sceneEffects, tile)),
    ).toEqual([1, 1, 1, 1]);

    await renderer.setGridBackground({
      ...createGridBackgroundInput(),
      imageKeys: ["a", "b", "c", "d"],
    })?.completion;
    expect(layer.children).toHaveLength(1);
    expect(layer.children[0]).not.toBe(first);
    for (const tile of firstTiles)
      expect(focusAmount(renderer.sceneEffects, tile)).toBe(0);
    expect(
      layer.children[0].children.map((tile: Container) =>
        focusAmount(renderer.sceneEffects, tile),
      ),
    ).toEqual([1, 1, 1, 1]);

    renderer.resetCameraEffects();
    expect(renderer.sceneEffects.focusFrame).toBeUndefined();
  });

  it("retains a focusout addressed to one lbg slot across puzzle replacement", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);
    renderer.setFocusParam({ blur: false, color: "Colorinverse" });
    renderer.setFocusOut({
      block: false,
      durationMs: 0,
      id: "ck_lbg_1",
      to: 0.5,
      type: "cgitem",
    });

    const input = createGridBackgroundInput();
    await renderer.setGridBackground(input)?.completion;
    const old = renderer.largeBackgroundView.root.children[0];
    expect(focusAmount(renderer.sceneEffects, old)).toBe(0.5);
    expect(
      focusAmount(
        renderer.sceneEffects,
        renderer.largeBackgroundView.root.children[1],
      ),
    ).toBe(0);

    await renderer.setGridBackground({
      ...input,
      imageKeys: ["a", "b", "c", "d"],
    })?.completion;
    const [first, second] = renderer.largeBackgroundView.root.children;
    expect(old.destroyed).toBe(true);
    expect(focusAmount(renderer.sceneEffects, old)).toBe(0);
    expect(focusAmount(renderer.sceneEffects, first)).toBe(0.5);
    expect(focusAmount(renderer.sceneEffects, second)).toBe(0);
  });

  it("keeps the large background in front of the background regardless of update order", async () => {
    const renderer = createRenderer();
    const input = createGridBackgroundInput();

    renderer.app = {};
    // Mirror LayerGraph.attach's scene order: background first, grid layer next.
    renderer.sceneLayer.addChild(renderer.backgroundLayer);
    renderer.sceneLayer.addChild(renderer.layers.gridBackground);
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // panel_large_background is a permanent sibling in front of panel_background
    // in SceneCanvas (nested Canvas sortingOrder 2 vs 1), so it always renders
    // on top -- executing background after gridbg must not sink the puzzle
    // below it.
    const gridIndex = () =>
      renderer.sceneLayer.children.indexOf(renderer.layers.gridBackground) -
      renderer.sceneLayer.children.indexOf(renderer.backgroundLayer);

    await renderer.setGridBackground(input)?.completion;
    expect(gridIndex()).toBe(1);

    await renderer.setBackground("bg_test");
    expect(gridIndex()).toBe(1);
    expect(renderer.backgroundLayer.children.at(-1)).toBe(
      renderer.backgroundRoot,
    );

    await renderer.setGridBackground(input)?.completion;
    expect(gridIndex()).toBe(1);
    expect(renderer.backgroundLayer.children.at(-1)).toBe(
      renderer.backgroundRoot,
    );
  });

  it.each([
    {
      input: {
        ...createGridBackgroundInput(),
        imageKeys: ["l1", "r1"],
        layout: "large" as const,
        solidHeights: [720],
        solidWidths: [100, 100],
      },
      name: "largebg",
    },
    {
      input: {
        ...createGridBackgroundInput(),
        imageKeys: ["t1", "t2", "t3", "t4"],
        layout: "grid" as const,
      },
      name: "gridbg",
    },
    {
      input: {
        ...createGridBackgroundInput(),
        imageKeys: ["t1", "t2", "t3", "t4"],
        layout: "vertical" as const,
      },
      name: "verticalbg",
    },
  ])(
    "removes the previous $name composition before fading in the new one",
    async ({ input }) => {
      // Native port: `_ExecuteImage` (largebg, 2.7.61 VA 0x183e77ee0),
      // `_ExecuteGridBG` (0x183e76290) and `_ExecuteVerticalBG` (0x183e79030)
      // all call `_ResetImages()` before `_LoadImage`, so a fadetime>0
      // replacement starts from an emptied panel — a blank gap while the new
      // puzzle fades in. Check the layer before its first update.
      const renderer = createRenderer();
      renderer.app = {};
      renderer.frames.manual = true;
      const layer = renderer.layers.gridBackground;
      renderer.sceneLayer.addChild(layer);
      renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

      await renderer.setGridBackground({ ...input, fadeMs: 0 })?.completion;
      const [firstRoot] = layer.children;
      expect(layer.children).toHaveLength(1);
      renderer.frames.step();

      await renderer.setGridBackground({ ...input, fadeMs: 500 })?.completion;

      expect(firstRoot.parent).toBeNull();
      expect(layer.children).toHaveLength(1);
      expect(layer.alpha).toBe(0);
      expect(renderer.largeBackgroundView.root).toBe(layer.children[0]);
    },
  );

  it.each([
    {
      input: {
        ...createGridBackgroundInput(),
        fadeMs: 0,
        imageKeys: ["l1", "r1"],
        layout: "large" as const,
        solidHeights: [720],
        solidWidths: [100, 100],
      },
      missingKey: "r1",
      name: "largebg",
    },
    {
      input: { ...createGridBackgroundInput(), fadeMs: 0 },
      missingKey: "r2",
      name: "gridbg",
    },
  ])(
    "warns and empties the panel when a $name tile fails to load",
    async ({ input, missingKey }) => {
      // Native port: a failed `_LoadImage` logs
      // "[AVG.LargeBG] An error occurred when load image {0}.", calls
      // `_ResetPanel()` and returns false without blocking. The branch is
      // shared on purpose: `_ExecuteGridBG` (2.7.71 VA 0x183f304c0) ends a
      // failed `_LoadImage` with the same `DLog.LogError` + `_ResetPanel()`
      // (VA 0x183f318aa) as `_ExecuteImage`, so gridbg must not keep the
      // previous composition either.
      const warnings: string[] = [];
      const renderer = createRenderer(createContext(), (warning) =>
        warnings.push(warning),
      );
      renderer.app = {};
      renderer.sceneLayer.addChild(renderer.layers.gridBackground);
      renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

      await renderer.setGridBackground(input)?.completion;
      expect(renderer.layers.gridBackground.children).toHaveLength(1);

      renderer.textureForImageKey = vi
        .fn()
        .mockImplementation((key: string) =>
          key === missingKey
            ? Promise.resolve(null)
            : Promise.resolve(Texture.EMPTY),
        );
      await renderer.setGridBackground(input)?.completion;

      expect(warnings).toEqual([`missing grid background: ${missingKey}`]);
      expect(renderer.layers.gridBackground.children).toHaveLength(0);
      expect(renderer.largeBackgroundView.root).toBeNull();
    },
  );

  it("applies the strict gridbg xScale and yScale transform", () => {
    const root = buildGridBackgroundRoot(createGridBackgroundInput(), [
      Texture.EMPTY,
      Texture.EMPTY,
      Texture.EMPTY,
      Texture.EMPTY,
    ]);

    expect(root.scale.x).toBe(0.5);
    expect(root.scale.y).toBe(0.75);
  });

  it("places every verticalbg tile, pivots on the first two heights and applies x/y/scale", () => {
    const root = buildGridBackgroundRoot(
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
    const textures = [
      new Texture({ label: "tile-0" }),
      new Texture({ label: "tile-1" }),
      new Texture({ label: "tile-2" }),
      new Texture({ label: "tile-3" }),
    ];
    const root = buildGridBackgroundRoot(
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

  it("applies verticalbg initposmode offsets with the two-tile height sum", () => {
    const build = (
      initPositionMode: GridBackgroundInput["initPositionMode"],
      solidHeights: number[],
      solidWidths: number[],
    ) =>
      buildGridBackgroundRoot(
        {
          ...createGridBackgroundInput(),
          imageKeys: solidHeights.map((_, index) => `v${index}`),
          initPositionMode,
          layout: "vertical",
          scaleX: 1,
          scaleY: 1,
          solidHeights,
          solidWidths,
          x: 0,
          y: 0,
        },
        solidHeights.map(() => Texture.EMPTY),
      );

    // Native builds `widthList = [solidwidth, 0]` -- the family pads the
    // dimension it lacks with 0, it does not repeat it -- and passes the full
    // height list, of which `_InitPosition*` reads entries [0]+[1]. The
    // `_offset` rect (solidwidth x (h0+h1)) is center-pivoted and matches the
    // Pixi root exactly, so the native Vector2 needs no pivot compensation.
    // With solidwidth 1000 and heights 500/300 (h0+h1 = 800):
    const positionOf = (
      initPositionMode: GridBackgroundInput["initPositionMode"],
    ) => {
      const { x, y } = build(initPositionMode, [500, 300], [1000]).position;
      return { x, y };
    };

    // center: (0, 0) -> (640, 360).
    expect(positionOf("center")).toEqual({ x: 640, y: 360 });
    // default: (widthList[1] / 2, -height[1] / 2) = (0, -150) -> (640, 510).
    expect(positionOf("default")).toEqual({ x: 640, y: 510 });
    // upperleft: ((1000 - 1280) / 2, (720 - 800) / 2) = (-140, -40).
    expect(positionOf("upperleft")).toEqual({ x: 500, y: 400 });
    // lowercenter: (0, (800 - 720) / 2) = (0, 40) -> (640, 320).
    expect(positionOf("lowercenter")).toEqual({ x: 640, y: 320 });

    // Corpus shape (level_main_16-18_end.txt:356): N=4 full-screen tiles with
    // the implicit `default` mode. The offset (0, -h1/2) = (0, -360) centers
    // the 1280x1440 `_offset` rect at y=720, so the rect spans [0, 1440] and
    // the top tile lands exactly on the 1280x720 canvas.
    const corpusRoot = build("default", [720, 720, 720, 720], [1280]);
    expect(corpusRoot.position.x).toBe(640);
    expect(corpusRoot.position.y).toBe(720);
    expect(corpusRoot.pivot.y).toBe(720);
  });

  it("pans verticalbg compositions with largebgtween", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setGridBackground({
      ...createGridBackgroundInput(),
      imageKeys: ["v1", "v2"],
      layout: "vertical",
      solidHeights: [720, 720],
      solidWidths: [1280],
      x: 0,
      y: 0,
    })?.completion;

    // The whole family shares one `_offset` container in native, so the
    // vertical composition must be registered for largebgtween as well.
    const root = renderer.layers.gridBackground.children[0];
    expect(renderer.largeBackgroundView.root).toBe(root);

    await renderer.setLargeBackgroundTween({
      block: false,
      durationMs: 0,
      yFrom: 0,
      yTo: 600,
    });

    // duration 0 snaps to the target: applyCenteredTransform maps y=600 to
    // position.y = 360 - 600.
    expect(root.position.y).toBe(-240);
  });

  it("lays out largebg as exactly two horizontal tiles", () => {
    const textures = [
      new Texture({ label: "tile-0" }),
      new Texture({ label: "tile-1" }),
    ];
    const root = buildGridBackgroundRoot(
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

  it("places every largebg initposmode at its native _initOffset", () => {
    // Native port: `_ExecuteImage` writes the selected `_InitPosition*`
    // result straight into `_initOffset.localPosition`, and the helpers get
    // `heights = [solidheight, 0]` (2.7.71 VA 0x183f33005-0x183f33025) --
    // largebg is a single row, so `height[1]` is 0 rather than a repeat of
    // `solidheight`. With two tiles of 400 + 600 and solidheight 500:
    //   center      `Vector2.zero`                          -> (0, 0)
    //   default     (width[1] / 2, -height[1] / 2)          -> (300, 0)
    //   upperleft   ((1000 - 1280) / 2, (720 - 500) / 2)    -> (-140, 110)
    //   lowercenter (0, (500 - 720) / 2)                    -> (0, -110)
    // The Pixi root pivots on the same rect as native's `_offset`, so the
    // only conversion is the flipped y axis: (640 + x, 360 - y).
    const place = (
      initPositionMode: GridBackgroundInput["initPositionMode"],
    ) => {
      const root = buildGridBackgroundRoot(
        {
          ...createGridBackgroundInput(),
          imageKeys: ["tile-0", "tile-1"],
          initPositionMode,
          layout: "large",
          scaleX: 1,
          scaleY: 1,
          solidHeights: [500],
          solidWidths: [400, 600],
          x: 0,
          y: 0,
        },
        [Texture.EMPTY, Texture.EMPTY],
      );
      return { x: root.position.x, y: root.position.y };
    };

    expect(place("center")).toEqual({ x: 640, y: 360 });
    expect(place("default")).toEqual({ x: 940, y: 360 });
    expect(place("upperleft")).toEqual({ x: 500, y: 250 });
    expect(place("lowercenter")).toEqual({ x: 640, y: 470 });
  });

  it("applies gridbg initposmode offsets in the centered pivot space", () => {
    const build = (initPositionMode: GridBackgroundInput["initPositionMode"]) =>
      buildGridBackgroundRoot(
        {
          ...createGridBackgroundInput(),
          initPositionMode,
          layout: "grid",
          scaleX: 1,
          scaleY: 1,
          solidHeights: [600, 640],
          solidWidths: [1000, 800],
          x: 0,
          y: 0,
        },
        [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY, Texture.EMPTY],
      );

    const positions = (mode: GridBackgroundInput["initPositionMode"]) => {
      const { position } = build(mode);
      return { x: position.x, y: position.y };
    };

    // POSITION_INIT_FUNCTION ports (2.7.61: 0x183e77451): default =
    // (w1/2, -h1/2), center = (0,0), upperleft = ((w0+w1-1280)/2,
    // (720-(h0+h1))/2), lowercenter = (0, (h0+h1-720)/2). The `_offset` rect
    // wraps the 2×2 puzzle exactly, so the native Vector2 needs no extra
    // pivot compensation — only the y flip done by the position formula.
    expect(positions("default")).toEqual({ x: 1040, y: 680 });
    expect(positions("center")).toEqual({ x: 640, y: 360 });
    expect(positions("upperleft")).toEqual({ x: 900, y: 620 });
    expect(positions("lowercenter")).toEqual({ x: 640, y: 100 });

    // Corpus shape (level_main_16-01_beg.txt:112): 1280/1280 × 720/720 with
    // default mode anchors the view on the top row: the half-tile offset
    // (640, -360) puts the puzzle's top edge exactly on the canvas top.
    const corpusRoot = buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        initPositionMode: "default",
        layout: "grid",
        scaleX: 1,
        scaleY: 1,
        x: -105,
        y: 0,
      },
      [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY, Texture.EMPTY],
    );
    expect(corpusRoot.position.x).toBe(1175);
    expect(corpusRoot.position.y).toBe(720);
  });

  it("registers every family layout as the largebgtween target", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    for (const layout of ["grid", "vertical", "large"] as const) {
      await renderer.setGridBackground({
        ...createGridBackgroundInput(),
        imageKeys: ["t1", "t2", "t3", "t4"],
        layout,
      })?.completion;
      const root = renderer.layers.gridBackground.children.at(-1);
      // `LargeBackgroundPanel._ExecuteImageTween` drives the family-shared
      // `_offset`, so gridbg/verticalbg puzzles must be tweenable too.
      expect(renderer.largeBackgroundView.root).toBe(root);
      expect(root.parent).toBe(renderer.layers.gridBackground);
    }
  });

  it("moves a gridbg puzzle with largebgtween", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setGridBackground({
      ...createGridBackgroundInput(),
      scaleX: 1,
      scaleY: 1,
      imageKeys: ["l1", "r1", "l2", "r2"],
      initPositionMode: "default",
      layout: "grid",
      x: 0,
      y: 0,
    })?.completion;

    // level_main_16-01_beg.txt:112-113 pans the skystarry grid with
    // [largebgtween(duration=40,yFrom=720,yTo=360)]. Native `_offset` is a
    // child of `_initOffset`, so the tween moves only the command-space
    // offset while the default half-tile init offset (640, -360) stays put:
    // y=720 puts the puzzle center on the canvas top edge, i.e. the visible
    // band becomes the bottom tile row.
    await renderer.setLargeBackgroundTween({ durationMs: 0, yTo: 720 });

    const root = renderer.largeBackgroundView.root;
    expect(root.position.x).toBe(1280);
    expect(root.position.y).toBe(0);
  });

  it("applies largebgtween in largebg transform space", async () => {
    const renderer = createRenderer();
    const root = buildGridBackgroundRoot(
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
    renderer.layers.gridBackground.addChild(root);
    renderer.largeBackgroundView.root = root;
    renderer.updatePhaseTweenRunner.run = vi.fn(
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

  it("maps largebgtween ease and loop onto the tween engine", async () => {
    const renderer = createRenderer();
    const root = buildGridBackgroundRoot(
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
    const tweenOptions: Array<{
      ease?: (t: number) => number;
      loops?: number;
    }> = [];
    const stepped: number[] = [];

    renderer.app = {};
    renderer.layers.gridBackground.addChild(root);
    renderer.largeBackgroundView.root = root;
    renderer.updatePhaseTweenRunner.run = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
        options?: { ease?: (t: number) => number; loops?: number },
      ) => {
        tweenOptions.push(options ?? {});
        step(0.5);
        stepped.push(renderer.readCenteredTransform(root).x);
        done?.();
      },
    );

    await renderer.setLargeBackgroundTween({
      block: true,
      durationMs: 1000,
      // ease="6" is corpus-attested (act12d0_st02): DOTween ordinal 6
      // resolves to OutQuad, so the raw 0.5 step lands at eased 0.75.
      ease: "6",
      xFrom: -180,
      xTo: -720,
    });
    await renderer.setLargeBackgroundTween({
      block: false,
      durationMs: 1000,
      loop: true,
      xFrom: -180,
      xTo: -720,
    });

    // The mocked engine feeds raw progress to the step callback, so both
    // passes land on the linear midpoint; the eased curve itself is asserted
    // on the captured options below (and end-to-end in tweenRunner.spec).
    expect(stepped).toEqual([-450, -450]);
    expect(tweenOptions.map(({ loops }) => loops)).toEqual([1, -1]);
    expect(tweenOptions[0]?.ease?.(0.5)).toBe(0.75);
  });

  it("applies largeimgtween in largeimg transform space", async () => {
    const renderer = createRenderer();
    const root = buildGridBackgroundRoot(
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
    renderer.layers.images.addChild(root);
    renderer.largeImageView.root = root;
    renderer.updatePhaseTweenRunner.run = vi.fn(
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

  it("maps largeimgtween ease and loop onto the tween engine", async () => {
    const renderer = createRenderer();
    const root = buildGridBackgroundRoot(
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
    const tweenOptions: Array<{
      ease?: (t: number) => number;
      loops?: number;
    }> = [];

    renderer.app = {};
    renderer.layers.images.addChild(root);
    renderer.largeImageView.root = root;
    renderer.updatePhaseTweenRunner.run = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
        options?: { ease?: (t: number) => number; loops?: number },
      ) => {
        tweenOptions.push(options ?? {});
        step(0.5);
        done?.();
      },
    );

    await renderer.setLargeImageTween({
      block: true,
      durationMs: 1000,
      // ease="6" is the DOTween ordinal syntax: 6 resolves to OutQuad, so
      // the raw 0.5 step lands at eased 0.75.
      ease: "6",
      xFrom: -160,
      xTo: -720,
    });
    await renderer.setLargeImageTween({
      block: false,
      durationMs: 1000,
      loop: true,
      xFrom: -160,
      xTo: -720,
    });

    expect(tweenOptions.map(({ loops }) => loops)).toEqual([1, -1]);
    expect(tweenOptions[0]?.ease?.(0.5)).toBe(0.75);
    // No ease argument keeps Ease.Linear (= GetEnum<Ease>("ease", 1)).
    expect(tweenOptions[1]?.ease?.(0.5)).toBe(0.5);
  });

  it("applies zero-duration largeimgtween immediately and cancels stale tweens", async () => {
    const renderer = createRenderer();
    const root = buildGridBackgroundRoot(
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
    renderer.layers.images.addChild(root);
    renderer.largeImageView.root = root;
    renderer.updatePhaseTweenRunner.run = vi.fn(
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

    const applySpy = vi.spyOn(root.position, "set");

    await renderer.setLargeImageTween({
      block: true,
      durationMs: 0,
      xFrom: -320,
    });

    expect(applySpy.mock.calls).toEqual([
      [320, 360],
      [480, 360],
    ]);

    (pendingStep as ((progress: number) => void) | null)?.(1);
    (pendingDone as (() => void) | null)?.();

    expect(root.position.x - 640).toBe(-160);
    expect(360 - root.position.y).toBe(0);
  });
});

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("LargeBackgroundPanel frame order", () => {
  const instantShow =
    '[largebg(imagegroup="left/right",solidwidth="16/16",solidheight=16,initposmode="center")]';
  const blockedShow =
    '[largebg(imagegroup="left/right",solidwidth="16/16",solidheight=16,initposmode="center",fadetime=0.032,block=true)]';

  it.each([
    {
      commands: [blockedShow],
      draws: [
        [0.5, 640, 0],
        [1, 640, 1],
      ],
      name: "fade in",
    },
    {
      commands: [
        instantShow,
        "[largebgtween(xTo=64,duration=0.032,block=true)]",
      ],
      draws: [
        [1, 672, 0],
        [1, 704, 1],
      ],
      name: "move",
    },
    {
      commands: [
        instantShow,
        "[largebgtween(xTo=64,duration=0.032)]",
        "[largebgtween(xTo=128,duration=0.064,block=true)]",
      ],
      draws: [
        [1, 696, 0],
        [1, 720, 1],
        [1, 744, 1],
        [1, 768, 1],
      ],
      name: "an older move releasing the wait of a newer move",
    },
    {
      commands: [instantShow, "[largebg(fadetime=0.032,block=true)]"],
      draws: [
        [0.5, 640, 0],
        [undefined, undefined, 1],
      ],
      name: "clear",
    },
    {
      commands: [
        instantShow,
        "[largebgtween(xTo=64,duration=0.032)]",
        "[largebg(fadetime=0.064,block=true)]",
      ],
      draws: [
        [0.75, 672, 0],
        [0.5, 704, 1],
        [0.25, 704, 1],
        [undefined, undefined, 1],
      ],
      name: "nonblocking move during a blocked clear",
    },
    {
      commands: [
        instantShow,
        "[largebg(fadetime=0.064)]",
        "[largebgtween(xTo=64,duration=0.032,block=true)]",
      ],
      draws: [
        [0.75, 672, 0],
        [0.5, 704, 1],
        [0.25, 704, 1],
        [undefined, undefined, 1],
      ],
      name: "blocked move during a nonblocking clear",
    },
    {
      commands: [
        instantShow,
        "[largebg(fadetime=0.032)]",
        "[largebgtween(xTo=64,duration=0.032,block=true)]",
      ],
      draws: [
        [0.5, 672, 0],
        [undefined, undefined, 1],
      ],
      name: "a move and clear finishing on the same frame",
    },
    {
      commands: [
        instantShow,
        "[largebg(fadetime=0.032)]",
        "[largebgtween(xTo=48,duration=0.048)]",
        "[largebgtween(xTo=64,duration=0.064,block=true)]",
      ],
      draws: [
        [0.5, 668, 0],
        [undefined, undefined, 0],
        [undefined, undefined, 0],
        [undefined, undefined, 0],
      ],
      name: "a clear killing both overlapping moves before they finish",
    },
    {
      commands: ["[largebg(fadetime=0.032,block=true)]"],
      draws: [
        [undefined, undefined, 0],
        [undefined, undefined, 1],
      ],
      name: "blocked clear of an empty panel",
    },
    {
      commands: ["[largebgtween(xTo=64,duration=0.032,block=1)]"],
      draws: [
        [undefined, undefined, 0],
        [undefined, undefined, 1],
      ],
      name: "blocked movement of an empty panel",
    },
    {
      commands: [
        "[largebgtween(duration=0.032)]",
        "[largebg(fadetime=1,block=true)]",
      ],
      draws: [
        [undefined, undefined, 0],
        [undefined, undefined, 1],
      ],
      name: "an empty-panel move releasing a later clear",
    },
    {
      commands: ["[delay(time=0.016)]", instantShow],
      draws: [
        [undefined, undefined, 0],
        [0, 640, 1],
        [1, 640, 1],
      ],
      name: "zero-duration fade started after Update",
    },
    {
      commands: [instantShow, "[delay(time=0.016)]", "[largebg]"],
      draws: [
        [1, 640, 0],
        [1, 640, 1],
        [undefined, undefined, 1],
      ],
      name: "zero-duration clear started after Update",
    },
  ])("preserves the draw order for $name", async ({ commands, draws }) => {
    const frames: unknown[] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [...commands, '[cgitem(image="after")]', '[name="A"]ok'],
      ({ gridBackground, cgItems }) => {
        const [root] = gridBackground.children;
        frames.push([
          root ? gridBackground.alpha : undefined,
          root?.position.x,
          cgItems.children.length,
        ]);
      },
    );
    const started = runtime.start();
    try {
      for (const [index] of draws.entries())
        app.ticker.update((index + 1) * 16);
      expect(frames).toEqual(draws);
    } finally {
      destroy();
      await started;
    }
  });

  it("samples an overlapping move after its predecessor writes and lets the predecessor resume", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        instantShow,
        "[largebgtween(xTo=128,xScaleTo=2,duration=0.128)]",
        "[delay(time=0)]",
        "[largebgtween(xFrom=-64,xTo=96,xScaleFrom=0.5,xScaleTo=3,duration=0.032)]",
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const [root] = renderer.layers.gridBackground.children;
      const poses = [16, 32, 48, 64].map((now) => {
        app.ticker.update(now);
        return [root.x, root.scale.x];
      });
      expect(poses).toEqual([
        [576, 0.5], // The new command writes its From pose immediately.
        [704, 2.125], // Its first Update samples the older tween's write.
        [736, 3],
        [704, 1.5], // The older tween resumes writing at its own elapsed time.
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    {
      command: "[largebgtween(xTo=64,duration=0.032,block=true)]",
      draws: [
        [0.5, 640, 0],
        [1, 672, 1],
        [1, 704, 1],
      ],
      name: "move",
    },
    {
      command: "[largebg(fadetime=0.064,block=true)]",
      // The old fade updates alpha to 1 before the new fade samples it,
      // then its OnKill releases the clear's wait before rendering.
      draws: [
        [0.5, 640, 0],
        [0.75, 640, 1],
        [0.5, 640, 1],
      ],
      name: "clear",
    },
  ])(
    "lets a fade-in release a blocked $name after skipping",
    async ({ command, draws }) => {
      const frames: unknown[] = [];
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          blockedShow,
          "[SkipToThis]",
          command,
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        ({ gridBackground, cgItems }) => {
          const [root] = gridBackground.children;
          frames.push([
            gridBackground.alpha,
            root?.position.x,
            cgItems.children.length,
          ]);
        },
      );
      const started = runtime.start();
      const { gridBackground } = renderer.layers;
      const [root] = gridBackground.children;
      expect(gridBackground.alpha).toBe(0);
      const skipped = runtime.skipNode();
      try {
        await flushAsync();
        for (const [index] of draws.entries())
          app.ticker.update((index + 1) * 16);
        expect(gridBackground.children).toEqual([root]);
        expect(frames).toEqual(draws);
      } finally {
        destroy();
        await Promise.all([started, skipped]);
      }
    },
  );

  it("keeps an earlier clear active when a new puzzle is shown", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [instantShow, "[largebg(fadetime=0.032)]", instantShow, '[name="A"]ok'],
      () => {},
    );
    const started = runtime.start();
    try {
      const { gridBackground } = renderer.layers;
      const [root] = gridBackground.children;
      app.ticker.update(16);
      expect(gridBackground.children).toEqual([root]);
      app.ticker.update(32);
      expect(gridBackground.children).toHaveLength(0);
      expect(root.destroyed).toBe(true);
    } finally {
      destroy();
      await started;
    }
  });

  it("limits how far the background fade advances on a long frame", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        instantShow.replace(")]", ",fadetime=0.75,block=true)]"),
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { cgItems, gridBackground } = renderer.layers;
      app.ticker.update(1000);
      expect(gridBackground.alpha).toBeCloseTo(4 / 9);
      expect(cgItems.children).toHaveLength(0);
      app.ticker.update(2000);
      app.ticker.update(2100);
      expect(gridBackground.alpha).toBe(1);
      expect(cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    { commands: [blockedShow], name: "fade-in", rootsAfterCallback: 1 },
    {
      commands: [instantShow, "[largebg(fadetime=0.032,block=true)]"],
      name: "clear",
      rootsAfterCallback: 0,
    },
  ])(
    "delivers a surviving $name callback after an uncached replacement mounts",
    async ({ commands, rootsAfterCallback }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          ...commands,
          "[SkipToThis]",
          blockedShow.replace("0.032", "0.064"),
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
      );
      const delayed = Promise.withResolvers<Texture>();
      const started = runtime.start();
      const load = vi
        .spyOn(renderer, "textureForImageKey")
        .mockReturnValueOnce(delayed.promise);
      const skipped = runtime.skipNode();
      try {
        const { cgItems, gridBackground } = renderer.layers;
        await flushAsync();
        app.ticker.update(16);
        app.ticker.update(32);
        expect(gridBackground.children).toHaveLength(0);
        expect(cgItems.children).toHaveLength(0);

        delayed.resolve(Texture.EMPTY);
        await flushAsync();
        app.ticker.update(48);
        expect(gridBackground.children).toHaveLength(rootsAfterCallback);
        expect(gridBackground.alpha).toBe(0.25);
        expect(cgItems.children).toHaveLength(1);
      } finally {
        delayed.resolve(Texture.EMPTY);
        destroy();
        load.mockRestore();
        await Promise.all([started, skipped]);
      }
    },
  );

  it.each([
    { old: [blockedShow], tiles: 1, cgItems: 1, readyAt: 16 },
    { old: [blockedShow], tiles: 1, cgItems: 1, readyAt: 32 },
    {
      old: [instantShow, "[largebg(fadetime=0.032)]"],
      tiles: 0,
      cgItems: 0,
      readyAt: 16,
    },
    {
      old: [instantShow, "[largebg(fadetime=0.032)]"],
      tiles: 0,
      cgItems: 0,
      readyAt: 32,
    },
  ])(
    "delivers the fade from $old to the move after a nonblocking load at $readyAt ms",
    async ({ old, tiles, cgItems, readyAt }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          ...old,
          '[name="A"]before',
          "[SkipToThis]",
          instantShow.replace("left/right", "cold/right"),
          "[largebgtween(xTo=64,duration=1,block=true)]",
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
      );
      const delayed = Promise.withResolvers<Texture>();
      const started = runtime.start();
      const load = vi
        .spyOn(renderer, "textureForImageKey")
        .mockReturnValueOnce(delayed.promise);
      const skipped = runtime.skipNode();
      try {
        await flushAsync();
        app.ticker.update(16);
        if (readyAt === 32) app.ticker.update(32);
        expect(renderer.layers.cgItems.children).toHaveLength(0);
        delayed.resolve(Texture.EMPTY);
        await flushAsync();
        expect(renderer.layers.cgItems.children).toHaveLength(0);
        app.ticker.update(readyAt + 16);
        expect(renderer.layers.gridBackground.children).toHaveLength(tiles);
        expect(renderer.layers.cgItems.children).toHaveLength(cgItems);
        app.ticker.update(1048);
        expect(renderer.layers.cgItems.children).toHaveLength(cgItems);
      } finally {
        delayed.resolve(Texture.EMPTY);
        destroy();
        load.mockRestore();
        await Promise.all([started, skipped]);
      }
    },
  );

  it("skips an uncached puzzle immediately and ignores its late tile after the jump", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[largebg(imagegroup="old_left/right",solidwidth="16/16",solidheight=16)]',
        "[SkipToThis]",
        instantShow,
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const delayed = Promise.withResolvers<Texture>();
    const oldTile = new Texture({ label: "old left" });
    const load = vi
      .spyOn(renderer, "textureForImageKey")
      .mockReturnValueOnce(delayed.promise);
    const started = runtime.start();
    const { gridBackground, cgItems } = renderer.layers;
    const skipped = runtime.skipNode();
    try {
      expect(gridBackground.children).toHaveLength(0);
      await flushAsync();
      app.ticker.update(16);
      expect(gridBackground.children).toHaveLength(1);
      expect(cgItems.children).toHaveLength(1);
      const [replacement] = gridBackground.children;
      delayed.resolve(oldTile);
      await flushAsync();
      app.ticker.update(32);
      expect(gridBackground.children).toEqual([replacement]);
      expect(
        replacement.children.map((tile: Sprite) => tile.texture.label),
      ).toEqual(["left", "right"]);
    } finally {
      delayed.resolve(oldTile);
      destroy();
      load.mockRestore();
      await Promise.all([started, skipped]);
    }
  });

  it("clears the native puzzle at story end while a move is still running", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [instantShow, "[largebgtween(xTo=64,duration=1,loop=true)]"],
      () => {},
    );
    const started = runtime.start();
    try {
      const [root] = renderer.layers.gridBackground.children;
      app.ticker.update(16);
      expect(root.destroyed).toBe(false);
      // Let the runner pass the story's 200 ms end delay.
      app.ticker.update(216);
      expect(runtime.getState()).toBe("finished");
      expect(renderer.layers.gridBackground.children).toHaveLength(0);
      expect(root.destroyed).toBe(true);
      app.ticker.update(232);
      expect(renderer.tweenUpdates.size).toBe(0);
    } finally {
      destroy();
      await started;
    }
  });
});
