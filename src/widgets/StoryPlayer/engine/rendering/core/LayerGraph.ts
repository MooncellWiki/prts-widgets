import { Container } from "pixi.js";

/**
 * Web/PIXI adaptation of the scene roots consumed by
 * `Torappu.AVG.AVGCameraEffect._ExecuteCameraShake` and the AVG panels.
 * It preserves the documented `SceneCanvas/panel_avg` sibling relationships,
 * while flattening Unity canvases into PIXI containers rather than porting
 * Unity's Canvas implementation.
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
  readonly items = new Container();
  readonly scene = new Container();
  readonly ui = new Container();
  readonly world = new Container();

  attach(stage: Container): void {
    // Unity panel_avg children, in nested-Canvas sortingOrder (2.7.71
    // sharedassets1.assets): background (no Canvas) and panel_common_executors
    // (non-visual), panel_background 1, panel_large_background 2,
    // panel_bgoverlay 10, panel_character 61, panel_charoverlay 70,
    // panel_image 121, panel_showItem 130, panel_cgoverlay 131,
    // panel_character_cutin 180. Only the first three are strict here: the
    // large background renders in front of the normal background (2 vs 1), so
    // a later [Background] must never cover a [largebg] composition. The
    // layers below panel_bgoverlay still sit at their nearest stable web
    // equivalent -- notably images/characters are inverted versus native --
    // until their strict pass is migrated.
    this.scene.addChild(this.background);
    this.scene.addChild(this.gridBackground);
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
