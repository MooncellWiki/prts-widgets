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
  readonly animTexts = new Container();
  readonly showItems = new Container();
  readonly scene = new Container();
  readonly ui = new Container();
  readonly world = new Container();

  attach(stage: Container): void {
    // 2791 sharedassets1 SceneCanvas sort orders: background 1, large
    // background 2, bgoverlay 10, character 61, charoverlay 70, image 121,
    // showItem 130, cgoverlay 131, character_cutin 180. Web image stacking
    // still uses the legacy position below characters.
    this.scene.addChild(this.background);
    this.scene.addChild(this.gridBackground);
    this.scene.addChild(this.avgDisplayBackground);
    this.scene.addChild(this.images);
    this.scene.addChild(this.characters);
    this.scene.addChild(this.avgDisplayCharacter);
    this.scene.addChild(this.showItems);
    this.scene.addChild(this.avgDisplayCg);
    this.scene.addChild(this.cutins);
    this.world.addChild(this.scene);
    // CgItemCanvas is a separate root canvas after SceneCanvas, so it sits
    // outside `scene`: camerashake moves AVGCameraEffect._sceneRoot, which is
    // the SceneCanvas-side panel_avg only, and must not drag CG items along.
    this.world.addChild(this.cgItems);
    // UICanvas/panel_displayable draws animtext above the scene and blocker,
    // below panel_curtains. SceneCanvas camera effects apply only to scene.
    this.world.addChild(this.animTexts);
    this.world.addChild(this.curtains);
    stage.addChild(this.world);
    stage.addChild(this.ui);
  }
}
