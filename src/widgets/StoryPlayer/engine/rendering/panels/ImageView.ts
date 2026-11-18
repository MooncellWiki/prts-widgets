import { Container } from "pixi.js";

import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type BackgroundInput,
  type ImageRotateInput,
  type ImageTweenInput,
} from "../../types";
import { dotweenEaseCurve } from "../core/DotweenEase";
import { createImageSprite } from "../core/ImageSprite";
import {
  applyCenteredTransform,
  readCenteredTransform,
  rotateTweenDelta,
} from "../core/SceneGeometry";

import type { SceneEffectManager } from "../SceneEffectManager";
import type { TextureLoad } from "../core/TextureAsset";
import type { TweenRunner } from "../core/TweenRunner";

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** PIXI view for the foreground AVGImagePanel. */
export class ImageView {
  private imageRoot: Container | null = null;
  private imageRotateSessionId = 0;

  constructor(
    private readonly imageLayer: Container,
    private readonly loadTexture: (key: string) => TextureLoad,
    private readonly tween: TweenRunner["run"],
    private readonly sceneEffects: Pick<
      SceneEffectManager,
      "setImageFocusTargets" | "releaseFixedFocusTarget"
    >,
  ) {
    // panel_image's centered pivot is serialized in the 2791 scene. With
    // pivot and position equal the child-space translation stays at zero.
    imageLayer.pivot.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    imageLayer.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
  }

  destroy(): void {
    this.imageRoot = null;
    this.imageLayer.removeChildren();
  }

  async setImage(key: string, input?: BackgroundInput): Promise<void> {
    const texture = await this.loadTexture(key);
    if (!texture) {
      // `_LoadImage` on a null sprite logs "Failed to load image: [{0}]"
      // (textureForUrl already reports it) and takes the clear branch:
      // DOFade(_backImage → 0), waiting for the fade when block is set.
      await this.clearImage(input?.fadeMs ?? 0, input?.block ?? false);
      return;
    }

    // `_ExecuteImage` only DOKills `_backImage` and its transform; the
    // panel-level rotation tween from `imagerotate` keeps running across
    // image swaps and the panel's current angle is preserved. Do NOT bump
    // imageRotateSessionId here (that would freeze a rotation mid-flight).
    const root = new Container();
    // The PPU sidecar only covers AVG/Backgrounds keys.
    const sprite = createImageSprite(texture, input);
    // `_ExecuteImage` reads `xScale`/`yScale` with a 1.0 fallback, so an
    // omitted scale must leave the screen-adapted size alone.
    applyCenteredTransform(root, {
      scaleX: input?.scaleX ?? 1,
      scaleY: input?.scaleY ?? 1,
      x: input?.x ?? 0,
      y: input?.y ?? 0,
    });
    root.addChild(sprite);

    const previous = this.imageRoot;
    this.imageRoot = root;
    this.imageLayer.addChild(root);
    const fadeMs = input?.fadeMs ?? 0;
    this.sceneEffects.setImageFocusTargets(
      "cg",
      root,
      fadeMs > 0 ? (previous ?? undefined) : undefined,
    );
    root.alpha = fadeMs > 0 ? 0 : 1;
    if (fadeMs <= 0) {
      previous?.removeFromParent();
      return;
    }
    const run = this.tween(
      fadeMs,
      (progress) => (root.alpha = progress),
      () => {
        if (!previous) return;
        previous.removeFromParent();
        this.sceneEffects.releaseFixedFocusTarget(previous);
      },
    );
    if (input?.block) await run;
    else void run;
  }

  async clearImage(fadeMs = 0, block = false): Promise<void> {
    // Same as setImage: the clear branch fades `_backImage` out and never
    // touches the panel rotation tween, so imagerotate keeps its angle and
    // any in-flight rotation keeps playing (see setImageRotate).
    const root = this.imageRoot;
    this.imageRoot = null;
    this.sceneEffects.setImageFocusTargets(
      "cg",
      undefined,
      fadeMs > 0 ? (root ?? undefined) : undefined,
    );
    if (!root) return;
    if (fadeMs <= 0) {
      root.removeFromParent();
      return;
    }
    const startAlpha = root.alpha;
    const run = this.tween(
      fadeMs,
      (progress) => (root.alpha = startAlpha * (1 - progress)),
      () => {
        root.removeFromParent();
        this.sceneEffects.releaseFixedFocusTarget(root);
      },
    );
    if (block) await run;
    else void run;
  }

  /**
   * Port of `Torappu.AVG.AVGImagePanel._ExecuteImageTween` for the foreground
   * visual. Native tweens `_foreImage.rectTransform` localPosition/localScale
   * with DOTween; both are reproduced on the image root, whose scale is the
   * localScale space (`setImage` keeps the screenadapt ratio on the inner
   * sprite). `ease` goes through the runner's `SetEase` option as a single
   * eased progress shared by the position and scale interpolation, matching
   * `SetEase` on both native tweens, and `loop` maps SetLoops(2*!loop-1) to
   * the same infinite Restart loop as `setBackgroundTween` (block is dropped
   * upstream for loops). Consecutive `imagetween`s are not cancelled (native
   * never calls DOKill either; both DOTween instances keep writing the same
   * transform); only an infinite loop is retired once its root stops being
   * the foreground image, since it would otherwise request frames for as long
   * as the renderer lives.
   *
   * Without a foreground image native dereferences `_foreImage` and throws;
   * story scripts always precede the tween with `[Image]`, so the silent
   * return only avoids the equivalent crash.
   */
  async setImageTween(input: ImageTweenInput): Promise<void> {
    const root = this.imageRoot;
    if (!root || root.parent !== this.imageLayer) return;

    // From/To default to the same current transform values (native reads the
    // current localPosition/localScale once for both fallbacks).
    const current = readCenteredTransform(root);
    const from = {
      scaleX: isFiniteNumber(input.xScaleFrom)
        ? input.xScaleFrom
        : current.scaleX,
      scaleY: isFiniteNumber(input.yScaleFrom)
        ? input.yScaleFrom
        : current.scaleY,
      x: isFiniteNumber(input.xFrom) ? input.xFrom : current.x,
      y: isFiniteNumber(input.yFrom) ? input.yFrom : current.y,
    };
    const to = {
      scaleX: isFiniteNumber(input.xScaleTo) ? input.xScaleTo : current.scaleX,
      scaleY: isFiniteNumber(input.yScaleTo) ? input.yScaleTo : current.scaleY,
      x: isFiniteNumber(input.xTo) ? input.xTo : current.x,
      y: isFiniteNumber(input.yTo) ? input.yTo : current.y,
    };

    // Native jumps to the From transform before starting the tweens, and a
    // non-positive duration Completes both tweens so the To state lands
    // immediately.
    applyCenteredTransform(root, from);

    if (input.durationMs <= 0) {
      applyCenteredTransform(root, to);
      return;
    }

    const run = this.tween(
      input.durationMs,
      (progress) => {
        applyCenteredTransform(root, {
          scaleX: from.scaleX + (to.scaleX - from.scaleX) * progress,
          scaleY: from.scaleY + (to.scaleY - from.scaleY) * progress,
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
        });
      },
      undefined,
      {
        ease: dotweenEaseCurve(input.ease),
        // Single passes keep writing an outgoing root until they finish, as
        // before; only a never-ending loop has to stop with its root.
        isAlive: input.loop ? () => this.imageRoot === root : undefined,
        loops: input.loop ? -1 : 1,
      },
    );

    if (input.block) await run;
    else void run;
  }

  /**
   * Port of `Torappu.AVG.AVGImagePanel._ExecuteImageRotate`: rotate the panel
   * transform (`_rectTransform`, the scene `panel_image` node) rather than its
   * foreground Image, preserving angle across image swaps. `imageLayer` is the
   * corresponding PIXI adaptation, with its constructor-time pivot mirroring
   * the RectTransform's serialized (0.5, 0.5) pivot so the rotation orbits the
   * panel center instead of the stage origin. Native never resets the angle
   * except `OnReset` (story start/skip); the widget builds a fresh renderer
   * per story, so no explicit zeroing is needed here.
   *
   * Unity's eulerAngles.z is counter-clockwise on screen (y-up; a positive
   * sweep is what CreateRotateTween's `counterClockwise` flag asks for), while
   * PIXI's `angle` is clockwise (y-down). The sweep is computed in Unity space
   * and negated at the PIXI boundary, the same axis flip applyCenteredTransform
   * does for `y`.
   */
  async setImageRotate(input: ImageRotateInput): Promise<void> {
    const target = this.imageLayer;
    const sessionId = ++this.imageRotateSessionId;
    const startAngle = -target.angle;
    const delta = rotateTweenDelta(
      startAngle,
      input.angleDeg,
      input.circles,
      input.inverse,
    );
    const endAngle = startAngle + delta;

    if (input.durationMs <= 0) {
      target.angle = -endAngle;
      return;
    }

    const run = this.tween(
      input.durationMs,
      (progress) => {
        if (this.imageRotateSessionId !== sessionId) return;
        target.angle = -(startAngle + delta * progress);
      },
      () => {
        if (this.imageRotateSessionId !== sessionId) return;
        target.angle = -endAngle;
      },
    );

    if (input.block) await run;
    else void run;
  }
}
