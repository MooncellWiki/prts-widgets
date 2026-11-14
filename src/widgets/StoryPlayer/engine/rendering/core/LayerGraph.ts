import { Container, RenderLayer } from "pixi.js";

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
  readonly ui = new Container();
  readonly world = new Container();

  constructor() {
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
    this.sceneCamera.addChild(this.scene, this.cgItems, this.sceneDraw);
    this.world.addChild(this.sceneCamera);
    // UICanvas/panel_displayable draws animtext above the scene and blocker,
    // below panel_curtains.
    this.world.addChild(this.animTexts);
    this.world.addChild(this.curtains);
    stage.addChild(this.world);
    stage.addChild(this.ui);
  }
}
