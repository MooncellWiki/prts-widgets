import {
  Application,
  CanvasSource,
  Sprite,
  Texture,
  type Container,
} from "pixi.js";

import { SceneEffectManager } from "../../../src/widgets/StoryPlayer/engine/rendering/SceneEffectManager";
import { LayerGraph } from "../../../src/widgets/StoryPlayer/engine/rendering/core/LayerGraph";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
} from "../../../src/widgets/StoryPlayer/engine/types";

// Open with pnpm dev. Use ?backend=webgl or ?backend=webgpu&resolution=2.
const params = new URLSearchParams(location.search);
const backend = params.get("backend") === "webgpu" ? "webgpu" : "webgl";
const resolution = params.get("resolution") === "2" ? 2 : 1;
const result = document.querySelector<HTMLPreElement>("#result")!;
const app = new Application();

function strip(
  parent: Container,
  x: number,
  width: number,
  tint: number,
  alpha = 1,
  zIndex = 0,
): Sprite {
  return parent.addChild(
    new Sprite({
      alpha,
      height: STORY_HEIGHT,
      texture: Texture.WHITE,
      tint,
      width,
      x,
      zIndex,
    }),
  );
}

function near(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 2)
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

async function testFocusOut(): Promise<void> {
  await app.init({
    antialias: true,
    autoStart: false,
    backgroundAlpha: 0,
    height: STORY_HEIGHT,
    preference: backend,
    resolution,
    width: STORY_WIDTH,
  });
  if (app.renderer.name !== backend)
    throw new Error(`Requested ${backend}, got ${app.renderer.name}`);
  const layers = new LayerGraph();
  const effects = new SceneEffectManager(layers, async () => {});
  layers.attach(app.stage);

  const background = strip(layers.background, 0, STORY_WIDTH, 0xff0000);
  const lowerBackground = strip(layers.background, 0, STORY_WIDTH, 0x0000ff);
  lowerBackground.y = 380;
  lowerBackground.height = STORY_HEIGHT - lowerBackground.y;
  effects.setImageFocusTargets("bg", background, lowerBackground);
  const cg = strip(layers.cgItems, 240, 240, 0x0000ff, 0.5, 180);
  effects.bindCgItem("cg", cg);
  strip(layers.characters, 480, 240, 0x0000ff, 0.5);
  strip(layers.cgItems, 320, 40, 0x0000ff, 1, 190);
  strip(layers.ui, 960, 120, 0x00ff00);

  const capture = document.createElement("canvas");
  capture.width = app.canvas.width;
  capture.height = app.canvas.height;
  const ctx = capture.getContext("2d", { willReadFrequently: true })!;
  const draw = () => {
    app.render();
    ctx.clearRect(0, 0, capture.width, capture.height);
    ctx.drawImage(app.canvas, 0, 0);
  };
  const sample = (x: number, y = 150) =>
    ctx.getImageData(x * resolution, y * resolution, 1, 1).data;
  const backgroundAmount = (to: number) =>
    effects.setFocusOut({
      block: false,
      durationMs: 0,
      id: "",
      to,
      type: "bg",
    });
  const cgAmount = (id: string, to: number) =>
    effects.setFocusOut({
      block: false,
      durationMs: 0,
      id,
      to,
      type: "cgitem",
    });

  effects.setFocusParam({ blur: false, color: "Colorinverse" });
  backgroundAmount(1);
  draw();
  near(sample(80)[1], 255, "Opaque focused background");
  near(sample(300)[1], 128, "Unfocused UI/Default at half alpha");
  near(sample(520)[1], 191, "Unfocused AVG_Char_AlphaSplit at half alpha");
  near(sample(340)[1], 0, "Unfocused opaque CG in front");
  near(sample(1000)[1], 255, "UI above the scene camera");

  cgAmount("cg", 0.25);
  draw();
  near(sample(300)[1], 159, "Focused CG subtracts from the current A");
  near(sample(340)[1], 0, "Front CG overwrites the lower ghost");
  cgAmount("cg", 0);

  effects.setFocusParam({ blur: true, color: "None" });
  draw();
  near(sample(80, 150)[0], 255, "Top of the processed scene");
  near(sample(80, 570)[2], 255, "Bottom of the processed scene");
  const blurredBlue = sample(239)[2];
  if (blurredBlue < 20)
    throw new Error("The blur must sample the neighboring CG");
  backgroundAmount(0.5);
  draw();
  near(sample(239)[2], blurredBlue / 2, "Half amount blends the same blur");
  backgroundAmount(0);
  draw();
  near(sample(239)[2], 0, "Focus pass turns off at zero");

  // A white stripe in a transparent 32px sprite. The native soft ghost
  // reaches three source texels away, even where the host emits no RGB.
  const silhouette = document.createElement("canvas");
  silhouette.width = 32;
  silhouette.height = 16;
  const art = silhouette.getContext("2d")!;
  art.fillRect(10, 0, 10, 16);
  const texture = new Texture({
    source: new CanvasSource({ resource: silhouette }),
  });
  const rim = layers.cgItems.addChild(
    new Sprite({ texture, x: 800, y: 142, zIndex: 180 }),
  );
  effects.bindCgItem("rim", rim);
  cgAmount("rim", 1);
  effects.setFocusParam({ blur: false, color: "Colorinverse" });
  draw();
  near(sample(805)[1], 0, "Transparent region beyond the rim");
  near(sample(807)[1], 255, "Soft ghost expands using source texels");

  cgAmount("rim", 0);
  backgroundAmount(1);
  layers.video.tint = 0x0000ff;
  const videoSize = { width: 320, height: 240 };
  layers.setVideoFrame(0.5, videoSize, Texture.WHITE);
  draw();
  near(
    sample(750, 360)[1],
    191,
    "Fading Sofdec video uses SrcAlpha on the backdrop ghost",
  );
  near(sample(900, 360)[1], 255, "Pixels outside the video keep the scene");
  layers.setVideoFrame(0);
  effects.reset();

  layers.setVideoFrame(0.5, videoSize);
  strip(layers.ui, 600, 32, 0x00ff00);
  draw();
  near(sample(640, 360)[3], 128, "DOM video reveals its fitted rect");
  near(sample(900, 360)[3], 255, "DOM video keeps the scene outside its rect");
  near(sample(620, 360)[1], 255, "UI stays above DOM video");
  layers.setVideoFrame(0);

  background.visible = false;
  lowerBackground.visible = false;
  effects.bindCgItem("cg", cg);
  cgAmount("cg", 1);
  effects.setFocusParam({ blur: false, color: "Colorinverse" });
  draw();
  near(sample(80)[1], 0, "The empty scene stays black during focus inversion");
  near(sample(300)[1], 128, "The bound CG inverts over the black backdrop");
  cgAmount("cg", 0);
  cgAmount("unbound", 1);
  effects.setFocusParam({ blur: true, color: "None" });
  draw();
  near(sample(239)[2], 0, "An unbound channel leaves the CG edge sharp");

  app.destroy(true, { children: true });
  texture.destroy(true);
}

void testFocusOut().then(
  () => {
    result.textContent = `PASS ${backend} at resolution ${resolution}`;
  },
  (error: unknown) => {
    result.textContent = `FAIL ${String(error)}`;
    console.error(error);
  },
);
