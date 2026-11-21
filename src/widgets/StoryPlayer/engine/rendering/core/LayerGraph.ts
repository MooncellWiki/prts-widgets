import {
  AlphaFilter,
  Container,
  Graphics,
  Rectangle,
  RenderLayer,
  Texture,
} from "pixi.js";

import { STORY_HEIGHT, STORY_WIDTH } from "../../types";

import { VideoFrame } from "./VideoFrame";

// 2791 sharedassets1.assets, AVGController (3630) canvas holder config.
export const sceneCanvasOrder = {
  background: 1,
  bgover: 10,
  cgitem: 180,
  cgover: 131,
  character: 61,
  charover: 70,
  cutin: 180,
  image: 121,
  largeBackground: 2,
  showItem: 130,
  video: 353,
} as const;

/** AVGCanvasLayerHolder._CalculateNewLayer (2791 @ 0x184167D50). */
export function canvasOrderForLayer(base: number, layer: number): number {
  return base + 10 * (layer - 1);
}

/**
 * Unity's SceneCanvas and CgItemCanvas share AVGCamera_Scene. A Pixi
 * RenderLayer reproduces their nested canvases' overrideSorting while
 * SceneCanvas/panel_avg still owns the transform used by camerashake.
 */
export class LayerGraph {
  readonly background = new Container();
  readonly avgDisplayBackground = new Container();
  readonly avgDisplayCharacter = new Container();
  readonly avgDisplayCg = new Container();
  readonly blocker = new Container();
  readonly characters = new Container();
  readonly cgItems = new Container();
  readonly cutins = new Container();
  readonly curtains = new Container();
  readonly gridBackground = new Container();
  readonly images = new Container();
  readonly animTexts = new Container();
  readonly showItems = new Container();
  readonly scene = new Container();
  readonly sceneCamera = new Container();
  readonly sceneDraw = new RenderLayer({ sortableChildren: true });
  readonly sceneViewport = new Container();
  readonly ui = new Container();
  readonly world = new Container();
  readonly video = new VideoFrame();
  private sceneFade?: AlphaFilter;

  constructor() {
    this.sceneViewport.filterArea = new Rectangle(
      0,
      0,
      STORY_WIDTH,
      STORY_HEIGHT,
    );
    // AVGSceneEffectManager._EnsureSourceDesc uses the camera's full viewport.
    // Scene contents can be smaller, larger, or move during camerashake.
    this.sceneCamera.filterArea = this.sceneViewport.filterArea.clone();
    this.video.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    this.video.zIndex = sceneCanvasOrder.video;
    this.sceneViewport.once("destroyed", () => this.sceneFade?.destroy());
    for (const slots of [
      this.cgItems,
      this.avgDisplayBackground,
      this.avgDisplayCharacter,
      this.avgDisplayCg,
    ]) {
      slots.on("childAdded", (root) => this.sceneDraw.attach(root));
    }
  }

  attach(stage: Container): void {
    this.scene.addChild(
      this.background,
      this.gridBackground,
      this.avgDisplayBackground,
      this.characters,
      this.avgDisplayCharacter,
      this.images,
      this.showItems,
      this.avgDisplayCg,
      this.cutins,
    );
    const fixedCanvases = [
      [this.background, sceneCanvasOrder.background],
      [this.gridBackground, sceneCanvasOrder.largeBackground],
      [this.characters, sceneCanvasOrder.character],
      [this.images, sceneCanvasOrder.image],
      [this.showItems, sceneCanvasOrder.showItem],
      [this.cutins, sceneCanvasOrder.cutin],
    ] as const;
    // At an equal sortingOrder Unity draws SceneCanvas before CgItemCanvas.
    this.sceneDraw.sortFunction = (a, b) =>
      a.zIndex - b.zIndex ||
      Number(a.parent === this.cgItems) - Number(b.parent === this.cgItems);
    for (const [root, order] of fixedCanvases) {
      root.zIndex = order;
      this.sceneDraw.attach(root);
    }
    this.sceneCamera.addChild(
      this.scene,
      this.cgItems,
      this.video,
      this.sceneDraw,
    );
    this.sceneDraw.attach(this.video);
    const clearColor = new Graphics()
      .rect(0, 0, STORY_WIDTH, STORY_HEIGHT)
      .fill(0x000000);
    this.sceneViewport.addChild(clearColor, this.sceneCamera);
    this.world.addChild(this.sceneViewport);
    // 2791 UICanvas/panel_avg draws panel_blocker, panel_displayable and
    // panel_curtains in that sibling order above the scene canvases.
    this.world.addChild(this.blocker, this.animTexts, this.curtains);
    stage.addChild(this.world);
    stage.addChild(this.ui);
  }

  /**
   * 2791 VideoCanvas (2503) draws on AVGCamera_Scene at order 353, so
   * scene effects also see its opacity during fades. Videos without
   * CORS access use the DOM beneath the canvas.
   */
  setVideoFrame(opacity: number, texture?: Texture): void {
    this.video.visible = texture !== undefined && opacity > 0;
    if (texture && this.video.texture !== texture) {
      const scale = Math.min(
        STORY_WIDTH / texture.width,
        STORY_HEIGHT / texture.height,
      );
      this.video.setFrame(texture);
      this.video.scale.set(texture.width * scale, texture.height * scale);
    }
    this.video.alpha = opacity;
    if (texture) opacity = 0;
    else this.video.setFrame(Texture.EMPTY);

    const scene = this.sceneViewport;
    scene.renderable = opacity < 1;
    if (opacity <= 0 || opacity >= 1) {
      if (scene.filters) scene.filters = null;
      return;
    }
    const fade = (this.sceneFade ??= new AlphaFilter({
      alpha: 1,
      antialias: "inherit",
      resolution: "inherit",
    }));
    fade.alpha = 1 - opacity;
    if (!scene.filters) scene.filters = fade;
  }
}
