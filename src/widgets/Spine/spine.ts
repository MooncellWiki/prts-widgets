/* eslint-disable @typescript-eslint/no-unused-vars */
import spine from "../../spine/runtime/spine-webgl";
import { downloadBlob } from "../../utils/utils";

function noop() {
  // noop
}
interface Skeleton {
  skeleton: spine.Skeleton;
  bounds: {
    offset: spine.Vector2;
    size: spine.Vector2;
  };
  state: spine.AnimationState;
  premultipliedAlpha: boolean;
}
interface Position {
  x: number;
  y: number;
  scale: number;
}

export class Spine {
  skeletons: Record<string, Skeleton> = {};
  canvas: HTMLCanvasElement;
  shader: spine.webgl.Shader;
  debugShader: spine.webgl.Shader;
  batcher: spine.webgl.PolygonBatcher;
  mvp: spine.webgl.Matrix4;
  skeletonRenderer: spine.webgl.SkeletonRenderer;
  debugRenderer: spine.webgl.SkeletonDebugRenderer;
  context: spine.webgl.ManagedWebGLRenderingContext;
  shapes: spine.webgl.ShapeRenderer;
  assetManager: spine.webgl.AssetManager;
  lastFrameTime: number;
  bg: [number, number, number, number] = [0, 0, 0, 0]; // rgba
  activeSkeleton: string | undefined;
  debug = false;
  position: Position;
  // static inner?: Spine;

  // static get(canvas?: HTMLCanvasElement): Spine {
  //   if (!Spine.inner) {
  //     if (!canvas) {
  //       throw new Error('spine is not init.');
  //     }
  //     const s = new Spine(canvas);
  //     Spine.inner = s;
  //   }
  //   return Spine.inner;
  // }
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // const gl = canvas.getContext('webgl', { alpha: true }) as WebGLRenderingContext;
    this.context = new spine.webgl.ManagedWebGLRenderingContext(canvas, {
      alpha: true,
    });
    //   canvas.getContext('experimental-webgl', { alpha: true });
    this.shader = spine.webgl.Shader.newTwoColoredTextured(this.context);
    this.batcher = new spine.webgl.PolygonBatcher(this.context);
    this.mvp = new spine.webgl.Matrix4();
    this.mvp.ortho2d(0, 0, canvas.width, canvas.height);
    this.position = { x: 0, y: 0, scale: 1 };
    this.skeletonRenderer = new spine.webgl.SkeletonRenderer(this.context);
    this.debugRenderer = new spine.webgl.SkeletonDebugRenderer(this.context);
    this.debugRenderer.drawRegionAttachments = true;
    this.debugRenderer.drawBoundingBoxes = true;
    this.debugRenderer.drawMeshHull = true;
    this.debugRenderer.drawMeshTriangles = true;
    this.debugRenderer.drawPaths = true;
    this.debugShader = spine.webgl.Shader.newColored(this.context);
    this.shapes = new spine.webgl.ShapeRenderer(this.context);
    this.assetManager = new spine.webgl.AssetManager(this.context);
    this.lastFrameTime = 0;
  }

  async load(
    name: string,
    skelPath: string,
    atlasPath: string,
    position: Position,
    skinName?: string,
    premultipliedAlpha = true,
  ): Promise<Skeleton> {
    if (this.skeletons[name]) return this.skeletons[name];

    await this.fetchAssets(skelPath, atlasPath);
    return this.loadSkel(
      name,
      skelPath,
      atlasPath,
      position,
      premultipliedAlpha,
      skinName,
    );
  }

  private async fetchAssets(skel: string, atlas: string): Promise<string[]> {
    const skelPromise = new Promise<string>((resolve, reject) => {
      this.assetManager.loadBinary(
        skel,
        (p) => resolve(p),
        (p) => reject(p),
      );
    });

    const atlasPromise = new Promise<string>((resolve, reject) => {
      this.assetManager.loadTextureAtlas(
        atlas,
        (p) => resolve(p),
        (p) => reject(p),
      );
    });

    return Promise.all([skelPromise, atlasPromise]);
  }

  private loadSkel(
    name: string,
    skelPath: string,
    atlasPath: string,
    position: Position,
    premultipliedAlpha = true,
    skinName?: string,
  ): Skeleton {
    const atlas = this.assetManager.get(atlasPath);
    const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
    const skel = this.assetManager.get(skelPath);
    const skeletonBinary = new spine.SkeletonBinary(atlasLoader);
    const skeletonData = skeletonBinary.readSkeletonData(skel);
    const skeleton = new spine.Skeleton(skeletonData);
    if (skinName) skeleton.setSkinByName(skinName);

    const bounds = calculateBounds(skeleton);
    const animationStateData = new spine.AnimationStateData(skeleton.data);
    const animationState = new spine.AnimationState(animationStateData);
    this.mvp.ortho2d(
      position.x,
      position.y,
      this.canvas.width * position.scale,
      this.canvas.height * position.scale,
    );
    this.skeletons[name] = {
      skeleton,
      bounds,
      state: animationState,
      premultipliedAlpha,
    };
    this.position = position;
    return this.skeletons[name];
  }

  play(activeSkeleton: string): void {
    if (this.lastFrameTime && activeSkeleton === this.activeSkeleton) {
      console.log("is playing!");
      return;
    }
    console.log("play", activeSkeleton);
    this.lastFrameTime = Date.now();
    this.activeSkeleton = activeSkeleton;
    this.render();
  }

  render(): void {
    if (!this.activeSkeleton) {
      this.lastFrameTime = 0;
      console.info("nothing to play");
      return;
    }
    const now = Date.now() / 1000;
    const delta = now - this.lastFrameTime;
    // delta = 0.016;
    this.lastFrameTime = now;

    // Update the MVP matrix to adjust for canvas size changes
    // resize();
    this.context.gl.clearColor(...this.bg);
    this.context.gl.clear(this.context.gl.COLOR_BUFFER_BIT);

    // Apply the animation state based on the delta time.
    const state = this.skeletons[this.activeSkeleton].state;
    const skeleton = this.skeletons[this.activeSkeleton].skeleton;
    // const bounds = this.skeletons[this.activeSkeleton].bounds;
    const premultipliedAlpha =
      this.skeletons[this.activeSkeleton].premultipliedAlpha;
    state.update(delta);
    state.apply(skeleton);
    skeleton.updateWorldTransform();

    // Bind the shader and set the texture and model-view-projection matrix.
    this.shader.bind();
    this.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
    this.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, this.mvp.values);

    // Start the batch and tell the SkeletonRenderer to render the active skeleton.
    this.batcher.begin(this.shader);

    // this.skeletonRenderer.vertexEffect = null;

    this.skeletonRenderer.premultipliedAlpha = premultipliedAlpha;
    this.skeletonRenderer.draw(this.batcher, skeleton);
    this.batcher.end();

    this.shader.unbind();

    // draw debug information
    const debug = this.debug;
    if (debug) {
      this.debugShader.bind();
      this.debugShader.setUniform4x4f(
        spine.webgl.Shader.MVP_MATRIX,
        this.mvp.values,
      );
      this.debugRenderer.premultipliedAlpha = premultipliedAlpha;
      this.shapes.begin(this.debugShader);
      this.debugRenderer.draw(this.shapes, skeleton);
      this.shapes.end();
      this.debugShader.unbind();
    }

    requestAnimationFrame(this.render.bind(this));
  }

  getCurrent(): Skeleton | undefined {
    if (!this.activeSkeleton) return undefined;

    console.log("getCurrent", this.activeSkeleton);
    return this.skeletons[this.activeSkeleton];
  }

  move(x: number, y: number): void {
    console.log(x, y);
    if (!this.activeSkeleton) return;

    this.position.x = x;
    this.position.y = y;
    this.mvp.ortho2d(
      x,
      y,
      this.canvas.width / this.position.scale,
      this.canvas.height / this.position.scale,
    );
  }

  scale(scale: number): void {
    this.position = {
      scale,
      x: this.position.x,
      y: this.position.y,
    };
    this.mvp.ortho2d(
      this.position.x,
      this.position.y,
      this.canvas.width / scale,
      this.canvas.height / scale,
    );
  }

  transform(x: number, y: number, scale: number): void {
    this.position = {
      scale,
      x,
      y,
    };
    this.mvp.ortho2d(
      this.position.x,
      this.position.y,
      this.canvas.width / scale,
      this.canvas.height / scale,
    );
  }

  async record(ani: string, name: string): Promise<void> {
    if (!this.activeSkeleton) throw new Error("activeSkeleton is empty");

    const stream = this.canvas.captureStream(60);
    const chunks: BlobPart[] = [];
    const mr = new MediaRecorder(stream, { mimeType: "video/webm" });
    mr.ondataavailable = (e: BlobEvent) => {
      chunks.push(e.data);
    };
    let started = false;
    const state = this.skeletons[this.activeSkeleton].state;

    state.addListener({
      start: (_) => {
        console.log("start");
        started = true;
        mr.start();
      },
      end: noop,
      interrupt: noop,
      dispose: noop,
      complete: (_) => {
        if (!started) return;

        console.log("end");
        mr.stop();
      },
      event: noop,
    });
    state.setAnimation(0, ani, false);

    return new Promise<void>((resolve) => {
      mr.onstop = () => {
        const blob = new Blob(chunks, {
          type: "video/webm",
        });
        downloadBlob(blob, name || "output");
        state.clearListeners();
        resolve();
      };
    });
  }
}
function calculateBounds(skeleton: spine.Skeleton) {
  skeleton.setToSetupPose();
  skeleton.updateWorldTransform();
  const offset = new spine.Vector2();
  const size = new spine.Vector2();
  skeleton.getBounds(offset, size, []);
  return { offset, size };
}
