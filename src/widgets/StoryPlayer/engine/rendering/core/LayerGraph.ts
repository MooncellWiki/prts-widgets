import { Container } from "pixi.js";

/** Owns the stable canvas/layer graph; panels receive only the layer they render into. */
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
  readonly items = new Container();
  readonly scene = new Container();
  readonly ui = new Container();
  readonly world = new Container();

  attach(stage: Container): void {
    this.background.addChild(this.gridBackground);
    // Unity SceneCanvas sibling order: large background, background, image,
    // character cutin/items, then characters. Existing panels are attached to
    // their nearest stable web equivalent until their strict pass is migrated.
    this.scene.addChild(this.background);
    this.scene.addChild(this.avgDisplayBackground);
    this.scene.addChild(this.images);
    this.scene.addChild(this.avgDisplayCg);
    this.scene.addChild(this.cutins);
    this.scene.addChild(this.items);
    this.scene.addChild(this.characters);
    this.scene.addChild(this.avgDisplayCharacter);
    this.world.addChild(this.scene);
    // CgItemCanvas is a separate root canvas after SceneCanvas, so it sits
    // outside `scene`: camerashake moves AVGCameraEffect._sceneRoot, which is
    // the SceneCanvas-side panel_avg only, and must not drag CG items along.
    this.world.addChild(this.cgItems);
    this.world.addChild(this.curtains);
    stage.addChild(this.world);
    stage.addChild(this.ui);
  }
}
