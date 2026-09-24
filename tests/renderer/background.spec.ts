import { Container, Texture, TextureSource, TilingSprite } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { createContext, createRenderer } from "../helpers/rendererFixtures";

describe("PixiStoryRenderer", () => {
  it("applies background transforms in a dedicated transform space", async () => {
    const renderer = createRenderer();
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

  it("keeps the background at its native sprite size when screenadapt is omitted", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // A key absent from the ppu sidecar with a non-16:9 texture falls back
    // to the texture size: SetNativeSize semantics with no sidecar entry and
    // no ppu heuristic to apply.
    await renderer.setBackground("bg_festival_9x");
    expect(renderer.backgroundSprite.width).toBe(1);
    expect(renderer.backgroundSprite.height).toBe(1);
  });

  it("renders a ppu-tuned background at its sidecar-derived native rect", async () => {
    const renderer = createRenderer({
      ...createContext(),
      backgroundPpuMap: { bg_cher_1: 68.24644470214844 },
    });
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(
      new Texture({
        source: new TextureSource({ height: 576, width: 1024 }),
      }),
    );

    // Native SetNativeSize writes sprite.rect / ppu * 100, and AVG
    // background art ships a tuned per-asset ppu: bg_cher_1 is a 1024x576
    // texture with ppu 68.2464 that natively renders 1500.44x844 -- the 17%
    // centered overscan the game shows for
    // [Background(image="bg_cher_1", width=1, height=1, fadetime=0)] in
    // obt/main/level_main_01-03_end. Web PNGs carry no ppu metadata, so the
    // avg/background.json sidecar supplies it.
    await renderer.setBackground("bg_cher_1");

    expect(renderer.backgroundSprite.width).toBeCloseTo(1500.4445, 3);
    expect(renderer.backgroundSprite.height).toBeCloseTo(844, 3);
  });

  it("renders a native-1024x576 background with borders like the game", async () => {
    const renderer = createRenderer({
      ...createContext(),
      backgroundPpuMap: { "33_g4_srctheater": 100 },
    });
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(
      new Texture({
        source: new TextureSource({ height: 576, width: 1024 }),
      }),
    );

    // 33_g4_srctheater ships ppu 100, so the game really shows it at
    // 1024x576 centered with the backing color around it (used without
    // screenadapt in activities/act21side); filling the canvas here would
    // diverge from native.
    await renderer.setBackground("33_g4_srctheater");

    expect(renderer.backgroundSprite.width).toBe(1024);
    expect(renderer.backgroundSprite.height).toBe(576);
  });

  it("matches sidecar keys case-insensitively", async () => {
    const renderer = createRenderer({
      ...createContext(),
      backgroundPpuMap: { "21_g9_rhodes_xqoffice": 100 },
    });
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(
      new Texture({
        source: new TextureSource({ height: 576, width: 1024 }),
      }),
    );

    // Sidecar keys are the lowercase bundle container names (= web asset
    // URLs); 99 sprites carry a mixed-case m_Name (21_G9_rhodes_xqoffice,
    // also ppu 100 -> 1024x576 borders), so a differently-cased story key
    // must still hit the sidecar rather than the 16:9 fill fallback.
    await renderer.setBackground("21_G9_rhodes_xqoffice");

    expect(renderer.backgroundSprite.width).toBe(1024);
    expect(renderer.backgroundSprite.height).toBe(576);
  });

  it("falls back to the 1280x720 canvas for unknown 16:9 backgrounds", async () => {
    const renderer = createRenderer({
      ...createContext(),
      backgroundPpuMap: { bg_cher_1: 68.24644470214844 },
    });
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(
      new Texture({
        source: new TextureSource({ height: 576, width: 1024 }),
      }),
    );

    // A 16:9 key missing from the sidecar (post-sidecar art: every 16:9
    // background added since 2023 ships a ppu tuned so the native rect is
    // exactly the reference canvas).
    await renderer.setBackground("bg_brand_new");

    expect(renderer.backgroundSprite.width).toBe(1280);
    expect(renderer.backgroundSprite.height).toBe(720);
  });

  it("multiplies the native rect by the width and height params", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setBackground("bg_test", { height: 0.5, width: 2.5 });

    // `_LoadImage`: sizeDelta = (native.x * width, native.y * height), both
    // defaulting to 1.0 (mulss at 0x183e587b0/0x183e587b4 in build 2761).
    expect(renderer.backgroundSprite.width).toBe(2.5);
    expect(renderer.backgroundSprite.height).toBe(0.5);
  });

  it("feeds the width/height-multiplied rect into the screenadapt ratio check", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // A square texture scaled 4x taller is narrower than 16:9, so `coverall`
    // takes the width-fit branch on the *multiplied* ratio and produces
    // (1280, 4 * 1280).
    await renderer.setBackground("bg_test", {
      height: 4,
      screenAdapt: "coverall",
    });

    expect(renderer.backgroundSprite.width).toBe(1280);
    expect(renderer.backgroundSprite.height).toBe(5120);
  });

  it("clears the previous background when the texture fails to load", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setBackground("bg_test");
    const previous = renderer.backgroundRoot;
    expect(previous.parent).toBe(renderer.backgroundLayer);

    renderer.textureForImageKey = vi.fn().mockResolvedValue(null);
    renderer.tween = vi.fn(async () => {});

    await renderer.setBackground("bg_missing", { block: true, fadeMs: 500 });

    // Native `_LoadImage` maps a failed sprite load onto the clear branch:
    // DOFade(_backImage -> 0) with the command's scaled duration and block
    // gate, so the old background fades out instead of staying visible.
    expect(renderer.backgroundRoot).toBeNull();
    expect(renderer.backgroundSprite).toBeNull();
    expect(renderer.tween).toHaveBeenCalledTimes(1);
    expect(renderer.tween).toHaveBeenCalledWith(
      500,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("tiles the background texture when tiled is true", async () => {
    const renderer = createRenderer({
      ...createContext(),
      backgroundPpuMap: { bg_ri_1: 68.24644470214844 },
    });
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setBackground("bg_ri_1", { tiled: true });

    // `_LoadImage`: tiled=true sets Image.type = Tiled, repeating the sprite
    // inside the final sizeDelta rect; TilingSprite + repeat wrap mode is
    // the PIXI equivalent. bg_ri_1 is ppu-tuned (native rect = texture
    // 16x16 / ppu 68.2464 * 100), and each tile spans that native rect
    // rather than the 16x16 texture pixels (tileScale = 100 / ppu). The 1x1
    // EMPTY stand-in here therefore spans 100 / 68.2464 = 1.4653.
    expect(renderer.backgroundSprite).toBeInstanceOf(TilingSprite);
    expect(renderer.backgroundSprite.width).toBeCloseTo(1.4653, 3);
    expect(renderer.backgroundSprite.height).toBeCloseTo(1.4653, 3);
    expect(renderer.backgroundSprite.tileScale.x).toBeCloseTo(1.4652778, 6);
    expect(Texture.EMPTY.source.style.addressMode).toBe("repeat");
    // Restore the shared EMPTY texture so the address mode does not leak into
    // the other specs.
    Texture.EMPTY.source.style.addressMode = "clamp-to-edge";
  });

  it("keeps an image at its asset size when screenadapt is omitted", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setImage("ac3_title1");

    expect(renderer.imageRoot.children[0].width).toBe(1);
    expect(renderer.imageRoot.children[0].height).toBe(1);
  });

  it("separates screenadapt size from the imagetween localScale space", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // Native `_foreImage` carries the screenadapt fit in sizeDelta while
    // imagetween writes localScale: a CG coverall'd to 1280 renders
    // xScaleTo=1.05 as 1344px, not as textureWidth * 1.05.
    await renderer.setImage("pic_test", {
      block: false,
      fadeMs: 0,
      scaleX: 1,
      scaleY: 1,
      screenAdapt: "coverall",
      tiled: false,
      x: 0,
      y: 0,
    });
    const root = renderer.imageRoot;
    // The screenadapt fit lives on the inner sprite (native sizeDelta); the
    // root only carries xScale/yScale (native localScale).
    const sprite = root.children[0];
    expect(sprite.width).toBe(1280);

    await renderer.setImageTween({
      block: false,
      durationMs: 0,
      ease: "Linear",
      xScaleFrom: 1,
      xScaleTo: 1.05,
    });

    expect(root.scale.x).toBe(1.05);
    expect(sprite.width).toBe(1280);
    // Rendered width = adapted sizeDelta * localScale.
    expect(sprite.width * root.scale.x).toBe(1344);
  });

  it("falls back to the current root transform for missing From/To", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setImage("ac3_title1", {
      block: false,
      fadeMs: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      tiled: false,
      x: 24,
      y: -36,
    });

    // Omitted From/To reuse the current localPosition/localScale (native
    // reads them once as the shared fallback), so nothing moves.
    await renderer.setImageTween({
      block: false,
      durationMs: 0,
      ease: "Linear",
    });

    expect(renderer.imageRoot.scale.x).toBe(1.5);
    expect(renderer.imageRoot.scale.y).toBe(1.5);
    expect(renderer.imageRoot.position.x).toBe(664);
    expect(renderer.imageRoot.position.y).toBe(396);
  });

  it("applies the imagetween ease curve to position and scale", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setImage("ac3_title1");
    const root = renderer.imageRoot;
    const samples: Array<{ scaleX: number; x: number }> = [];
    // The curve reaches the runner through TweenRunner's SetEase option, so the
    // stub has to apply it the way `run` would.
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        _done: undefined,
        options: { ease: (raw: number) => number },
      ) => {
        step(options.ease(0.25));
        samples.push({ scaleX: root.scale.x, x: root.position.x });
      },
    );

    await renderer.setImageTween({
      block: true,
      durationMs: 1000,
      ease: "InOutCubic",
      xFrom: 0,
      xScaleFrom: 1,
      xScaleTo: 2,
      xTo: 100,
    });

    // SetEase applies to both DOLocalMove and DOScale; at raw time 0.25
    // InOutCubic yields 4 * 0.25^3 = 0.0625.
    expect(samples).toEqual([{ scaleX: 1.0625, x: 646.25 }]);
  });

  it("retires only a looping imagetween with its image root", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setImage("ac3_title1");
    const runs: Array<{ isAlive?: () => boolean; loops?: number }> = [];
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        _step: (progress: number) => void,
        _done: undefined,
        options?: { isAlive?: () => boolean; loops?: number },
      ) => {
        runs.push({ isAlive: options?.isAlive, loops: options?.loops });
      },
    );

    await renderer.setImageTween({
      block: false,
      durationMs: 1000,
      ease: "Linear",
      xTo: 100,
    });
    await renderer.setImageTween({
      block: false,
      durationMs: 1000,
      ease: "Linear",
      loop: true,
      xTo: 50,
    });

    // A single pass keeps the runner-wide lifetime; loop=true maps to
    // SetLoops(-1) and only lives while its root is the foreground image.
    expect(
      runs.map(({ isAlive, loops }) => ({ alive: isAlive?.(), loops })),
    ).toEqual([
      { alive: undefined, loops: 1 },
      { alive: true, loops: -1 },
    ]);
    await renderer.clearImage();
    expect(runs[1]!.isAlive!()).toBe(false);
  });

  it("rotates the image panel around its center instead of the stage origin", async () => {
    const renderer = createRenderer();
    const imageLayer = renderer.imageLayer;

    // Native `panel_image` serializes its RectTransform pivot at (0.5, 0.5) —
    // the panel center. PIXI's default pivot (0, 0) made every rotation orbit
    // the stage's top-left corner instead of tilting the picture in place.
    expect(imageLayer.pivot.x).toBe(640);
    expect(imageLayer.pivot.y).toBe(360);
    expect(imageLayer.position.x).toBe(640);
    expect(imageLayer.position.y).toBe(360);

    const center = new Container();
    center.position.set(640, 360);
    imageLayer.addChild(center);

    await renderer.setImageRotate({
      angleDeg: 180,
      block: false,
      circles: 0,
      durationMs: 0,
      inverse: false,
    });

    // CreateRotateTween takes the short way: 0 -> 180 sweeps -180 degrees
    // (clockwise in Unity), i.e. +180 in PIXI's clockwise angle.
    expect(imageLayer.angle).toBeCloseTo(180);
    const centerGlobal = center.toGlobal({ x: 0, y: 0 });
    expect(centerGlobal.x).toBeCloseTo(640);
    expect(centerGlobal.y).toBeCloseTo(360);

    // A sprite at the stage corner swings to the opposite corner, proving the
    // pivot sits at the screen center rather than the top-left origin.
    const corner = new Container();
    imageLayer.addChild(corner);
    const cornerGlobal = corner.toGlobal({ x: 0, y: 0 });
    expect(cornerGlobal.x).toBeCloseTo(1280);
    expect(cornerGlobal.y).toBeCloseTo(720);
  });

  it("tilts the image panel clockwise on screen for a negative native angle", async () => {
    const renderer = createRenderer();
    const imageLayer = renderer.imageLayer;
    const right = new Container();
    right.position.set(740, 360);
    imageLayer.addChild(right);

    // level_main_11-01_end:55 `[imagerotate(angle=-4)]`: Unity's z = -4 is a
    // clockwise tilt (eulerAngles.z grows counter-clockwise, y-up), so a point
    // right of center must dip below the center line on the y-down stage.
    await renderer.setImageRotate({
      angleDeg: -4,
      block: false,
      circles: 0,
      durationMs: 0,
      inverse: false,
    });

    expect(imageLayer.angle).toBeCloseTo(4);
    // 100px right of center, tilted 4 degrees: y = 360 + 100 * sin(4deg).
    expect(right.toGlobal({ x: 0, y: 0 }).y).toBeCloseTo(366.976, 3);

    // The next sweep reads the current angle back in Unity space: -4 -> 0 is
    // a +4 delta, which the clockwise default rewrites to -356.
    const steps: Array<(progress: number) => void> = [];
    renderer.app = {};
    renderer.tween = vi.fn(
      async (_durationMs: number, step: (progress: number) => void) => {
        steps.push(step);
      },
    );
    await renderer.setImageRotate({
      angleDeg: 0,
      block: false,
      circles: 0,
      durationMs: 1000,
      inverse: false,
    });
    steps[0]!(1);
    expect(imageLayer.angle).toBeCloseTo(360);
  });

  it("anchors tiled image and background tiles at the lower-left corner like Unity", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    const tile = new Texture({
      source: new TextureSource({ height: 300, width: 100 }),
    });
    renderer.textureForImageKey = vi.fn().mockResolvedValue(tile);
    const input = {
      block: false,
      fadeMs: 0,
      height: 2.5,
      scaleX: 1,
      scaleY: 1,
      tiled: true,
      width: 1,
      x: 0,
      y: 0,
    };

    // Image.GenerateTiledSprite tiles up from the rect's lower-left corner and
    // clips the top row; PIXI starts at the top-left, so the 750px rect needs
    // its tile origin shifted by 750 % 300 to land a boundary on the bottom.
    await renderer.setImage("bg_0_am", input);
    const imageSprite = renderer.imageRoot.children[0];
    expect(imageSprite.height).toBe(750);
    expect(imageSprite.tilePosition.x).toBe(0);
    expect(imageSprite.tilePosition.y).toBe(150);

    await renderer.setBackground("bg_0_am", input);
    expect(renderer.backgroundSprite.tilePosition.y).toBe(150);

    // A whole number of tiles needs no shift.
    await renderer.setImage("bg_0_am", { ...input, height: 2 });
    expect(renderer.imageRoot.children[0].tilePosition.y).toBe(0);
  });

  it("multiplies the native size by width/height before screenadapt", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // _LoadImage: SetNativeSize, then sizeDelta = (w * width, h * height)
    // with a 1.0 fallback, before any screenadapt step.
    await renderer.setImage("avg_5_boom", {
      block: false,
      fadeMs: 0,
      height: 0.5,
      scaleX: 1,
      scaleY: 1,
      tiled: false,
      width: 2,
      x: 0,
      y: 0,
    });

    expect(renderer.imageRoot.children[0].width).toBe(2);
    expect(renderer.imageRoot.children[0].height).toBe(0.5);
  });

  it("feeds the multiplied rect into the screenadapt aspect comparison", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // A square texture is taller than 16:9, but width=2 flips the multiplied
    // rect to 2:1, so showall must take the width-fit branch
    // (`_AdaptScreenShowAll`: target ratio > reference ratio → adapt width).
    await renderer.setImage("avg_5_boom", {
      block: false,
      fadeMs: 0,
      height: 1,
      scaleX: 1,
      scaleY: 1,
      screenAdapt: "showall",
      tiled: false,
      width: 2,
      x: 0,
      y: 0,
    });

    expect(renderer.imageRoot.children[0].width).toBe(1280);
    expect(renderer.imageRoot.children[0].height).toBe(640);
  });

  it("takes the clear branch when the image texture fails to load", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);
    const clearImage = vi.spyOn(renderer, "clearImage");

    await renderer.setImage("first");
    expect(renderer.imageRoot.parent).toBe(renderer.imageLayer);

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
    expect(renderer.imageRoot).toBeNull();
    expect(renderer.imageLayer.children).toHaveLength(0);
  });

  it("renders a tiled image as a TilingSprite sized to the final rect", async () => {
    const renderer = createRenderer();
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

    expect(renderer.imageRoot.children[0]).toBeInstanceOf(TilingSprite);
    // Image.type = Tiled with no multipliers/adapt tiles at the native size.
    expect(renderer.imageRoot.children[0].width).toBe(1);
    expect(renderer.imageRoot.children[0].height).toBe(1);

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
    expect(renderer.imageRoot.children[0].width).toBe(1280);
    expect(renderer.imageRoot.children[0].height).toBe(720);
    // Restore the shared EMPTY texture so the address mode does not leak into
    // the other specs.
    Texture.EMPTY.source.style.addressMode = "clamp-to-edge";
  });

  it("keeps an in-flight imagerotate tween running across image swaps", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);
    const rotateSteps: Array<(progress: number) => void> = [];
    renderer.tween = vi.fn(
      async (_durationMs: number, step: (progress: number) => void) => {
        rotateSteps.push(step);
      },
    );

    // angle=90 without circles sweeps -270 degrees in Unity space
    // (AVGUtils.CreateRotateTween), negated at the PIXI boundary to a +270
    // clockwise sweep.
    await renderer.setImageRotate({
      angleDeg: 90,
      block: false,
      circles: 0,
      durationMs: 1000,
      inverse: false,
    });
    rotateSteps.at(-1)!(0.5);
    expect(renderer.imageLayer.angle).toBe(135);

    // _ExecuteImage only DOKills the back Image, never the panel rotation
    // tween: the swap must neither freeze nor reset the rotation.
    await renderer.setImage("30_i04");
    rotateSteps.at(-1)!(1);
    expect(renderer.imageLayer.angle).toBe(270);

    // The clear branch must not freeze it either.
    rotateSteps.at(-1)!(0.5);
    await renderer.clearImage();
    rotateSteps.at(-1)!(1);
    expect(renderer.imageLayer.angle).toBe(270);
  });

  it("applies backgroundtween in background transform space", async () => {
    const renderer = createRenderer();
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

  it("routes backgroundtween ease and loop into the tween options", async () => {
    const renderer = createRenderer();
    const root = new Texture({ label: "bg-ease" });

    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(root);
    const captured: Array<{
      durationMs: number;
      eased: number[];
      loops: number | undefined;
    }> = [];
    const midX: number[] = [];
    renderer.tween = vi.fn(
      (
        durationMs: number,
        step: (progress: number) => void,
        _done?: () => void,
        options?: { ease?: (raw: number) => number; loops?: number },
      ) => {
        // Drive a raw midpoint through the curve the renderer resolved from
        // the `ease` parameter, exactly like TweenRunner would.
        const eased = [0.5, 1].map((raw) => options?.ease?.(raw) ?? raw);
        captured.push({ durationMs, eased, loops: options?.loops });
        step(eased[0]);
        midX.push(renderer.backgroundRoot.position.x - 640);
        return Promise.resolve();
      },
    );

    await renderer.setBackground("bg_test");
    await renderer.setBackgroundTween({
      block: false,
      durationMs: 1500,
      ease: "OutQuad",
      loop: true,
      xFrom: 0,
      xTo: 130,
    });

    // `SetEase(OutQuad)` bends the raw 0.5 midpoint to 0.75, and
    // `SetLoops(2*!loop-1)` turns loop=true into an infinite Restart loop.
    expect(captured).toEqual([
      { durationMs: 1500, eased: [0.75, 1], loops: -1 },
    ]);
    // The eased progress reached the transform: 0 + (130 - 0) * 0.75.
    expect(midX).toEqual([97.5]);
  });

  it("defaults backgroundtween tween options to Linear single-pass", async () => {
    const renderer = createRenderer();
    const root = new Texture({ label: "bg-ease-default" });

    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(root);
    const captured: Array<{ eased: number[]; loops: number | undefined }> = [];
    renderer.tween = vi.fn(
      (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
        options?: { ease?: (raw: number) => number; loops?: number },
      ) => {
        captured.push({
          eased: [0.5].map((raw) => options?.ease?.(raw) ?? raw),
          loops: options?.loops,
        });
        step(0.5);
        done?.();
        return Promise.resolve();
      },
    );

    await renderer.setBackground("bg_test");
    await renderer.setBackgroundTween({
      block: false,
      durationMs: 1000,
      xFrom: 0,
      xTo: 100,
    });

    // Missing ease/loop keeps the native defaults: Ease.Linear, SetLoops(1).
    expect(captured).toEqual([{ eased: [0.5], loops: 1 }]);
  });

  it("retires a looping backgroundtween with its background session", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi
      .fn()
      .mockResolvedValue(new Texture({ label: "bg-loop" }));
    const checks: Array<() => boolean> = [];
    renderer.tween = vi.fn(
      (
        _durationMs: number,
        _step: (progress: number) => void,
        _done?: () => void,
        options?: { isAlive?: () => boolean },
      ) => {
        if (options?.isAlive) checks.push(options.isAlive);
        return Promise.resolve();
      },
    );

    await renderer.setBackground("bg_test");
    await renderer.setBackgroundTween({
      block: false,
      durationMs: 1000,
      loop: true,
      xTo: 100,
    });
    expect(checks.map((check) => check())).toEqual([true]);

    // Both a newer backgroundtween (session bump) and a replaced background
    // retire the infinite loop's frames, not just its transform writes.
    await renderer.setBackgroundTween({
      block: false,
      durationMs: 1000,
      loop: true,
      xTo: 50,
    });
    expect(checks.map((check) => check())).toEqual([false, true]);
    await renderer.setBackground("bg_other");
    expect(checks.map((check) => check())).toEqual([false, false]);
  });
});
