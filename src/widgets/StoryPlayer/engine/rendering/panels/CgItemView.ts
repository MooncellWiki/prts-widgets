import { Container, Sprite, Texture } from "pixi.js";

import {
  createExecutionHandle,
  type ExecutionEndReason,
  type ExecutionHandle,
} from "../../execution";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type CgItemInput,
  type CgItemShakeInput,
} from "../../types";
import { dotweenEaseCurve, type EaseCurve } from "../core/DotweenEase";
import { canvasOrderForLayer, sceneCanvasOrder } from "../core/LayerGraph";
import { Sequence } from "../core/Sequence";
import { buildShakePath, sampleShakePath } from "../core/ShakePath";

import type { TextureLoad } from "../core/TextureAsset";
import type { TweenRunner } from "../core/TweenRunner";

interface CgItemState {
  /**
   * `AVGShowItemCgSlot.m_animEpoch`: every `Hide` re-binds the slot's
   * `_onAnimEnd` and bumps the epoch through `_MakeAnimEndCb`. Only the latest
   * hide can dispose the slot and complete the command.
   */
  animEpoch: number;
  hide?: ExecutionHandle;
  key: string;
  root: Container;
  show?: ExecutionHandle;
  shake?: {
    handle: ExecutionHandle;
    infinite: boolean;
    onComplete?: () => void;
  };
}

/**
 * PostDisplay lifecycle of a cgitem slot, for the focus-effect processor.
 * Native `_ShowItem` binds every new slot through
 * `AVGSceneEffectManager.BindPostDisplay` (processors' `TryRegister`), and
 * `SlotInUseItem.Dispose` -- run on same-key replacement, hide completion
 * and each clear-all fade end -- disposes its `PostDisplayItem`
 * (processors' `BeforeItemDisposed`).
 */
export interface CgItemLifecycle {
  disposed: (key: string, root: Container) => void;
  registered: (key: string, root: Container) => void;
}

// MathUtil.GT and Equals in 2791 (0x1869451F0 / 0x186944A70).
const epsilon = 0.00001;

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function colorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function rgb(color: { r: number; g: number; b: number }): number {
  return (
    (colorChannel(color.r) << 16) |
    (colorChannel(color.g) << 8) |
    colorChannel(color.b)
  );
}

/**
 * Pixi adapter for `Torappu.AVG.AVGCgItemPanel`'s keyed slots, including
 * independent delayed tracks and clear-all's non-blocking completion.
 * Pixi sprites substitute for `AVGShowItemCgSlot`. Segment skips keep these
 * slots alive because ShouldResetOnSkip (2791 @ 0x184189160) defaults to false.
 *
 * AVGShowItemCgSlot's constructor (2791 @ 0x184243F30) enables layer overrides.
 * _OverrideLayer sets the Canvas order to the CG canvas order plus 10*(layer-1).
 * LayerGraph uses that order across the scene camera's canvases.
 */
export class CgItemView {
  private readonly states = new Map<string, CgItemState>();
  /**
   * Clear-all slots still fading out. Native
   * `_ClearAllItems` empties `m_slotsInUseDict` at once but only disposes
   * each slot at its fade end, so until then the slot stays registered with
   * the PostDisplay processors (focus effects keep applying).
   */
  private readonly fading = new Set<CgItemState>();
  // _AddItemToDict ignores empty keys. An empty-key blocker is still drawn.
  private readonly unkeyed = new Set<CgItemState>();

  constructor(
    private readonly layer: Container,
    private readonly loadTexture: (key: string) => TextureLoad,
    private readonly tween: TweenRunner["run"],
    private readonly onWarning?: (detail: string) => void,
    private readonly lifecycle?: CgItemLifecycle,
  ) {
    this.layer.sortableChildren = true;
  }

  /** The command panel observes the sequence even for a nonblocking show. */
  show(input: CgItemInput, onComplete?: () => void): ExecutionHandle {
    // Native provenance: `AVGCgItemPanel._ShowItem` (2791 @ 0x18418ABF0)
    // instantiates the new slot, instantly `Dispose()`s the previous same-key
    // entry (no fade), and writes the new entry into `m_slotsInUseDict`
    // BEFORE any sprite work. Its `_LoadSprite` is a synchronous cached load
    // (assets are preloaded via `InternalResRefCollector.GatherResRefs`), so
    // the executor never waits on I/O. The web port mirrors the command-side
    // ordering -- dispose old, register the placeholder root, use the cached
    // texture. On a cache miss block=false returns before the bytes arrive,
    // and a `hidecgitem` arriving mid-load can still find the key.
    const { assetKey, key } = input;
    const isBlocker = assetKey === undefined;
    const oldState = this.states.get(key);
    if (oldState) this.dispose(oldState);
    const root = new Container();
    root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    root.zIndex = canvasOrderForLayer(sceneCanvasOrder.cgitem, input.layer);
    this.layer.addChild(root);
    const state: CgItemState = {
      animEpoch: 0,
      key,
      root,
    };
    const show = createExecutionHandle(input.block);
    state.show = show;
    if (key) {
      this.states.set(key, state);
      this.lifecycle?.registered(key, root);
    } else {
      this.unkeyed.add(state);
    }
    const draw = (texture: Texture | null, width: number, height: number) => {
      // The slot was replaced, hidden, or cleared while the texture was in
      // flight: drop the frames instead of resurrecting a destroyed root.
      if (state.show !== show) return;
      if (!texture) {
        // Web adaptation: native would keep an empty registered slot; the
        // frontend undoes the pending registration so a failed load leaves
        // no invisible target behind (the missing asset is already warned).
        this.onWarning?.(`cgitem asset is missing: ${assetKey}`);
        this.dispose(state);
        return;
      }

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      if (input.width > 0 && input.height > 0) {
        // AVGShowItemCgSlot.Show writes sizeDelta (2791 @ 0x18424327B).
        // The blocker Image stretches to its parent before applying that delta.
        width = input.width + (isBlocker ? width : 0);
        height = input.height + (isBlocker ? height : 0);
      }

      // Unity sets the Image rect size independently of localScale. Pixi's
      // Sprite.setSize writes scale, so the image transform owns the tracks.
      sprite.setSize(width, height);
      const image = root.addChild(new Container());
      image.addChild(sprite);

      // `AVGShowItemCgSlot.Show` (2791 @ 0x184242CE0) reads the curve with
      // `GetEnum<Ease>(param, "ease", (Ease)1, ignoreCase: false)`; DOTween's
      // `Ease` enum is `Unset = 0, Linear = 1, InSine = 2, ...`, so this is
      // the same Ease.Linear default/fallback as every other AVG tween
      // command and the shared DOTween curve library applies as-is.
      const ease = dotweenEaseCurve(input.ease);
      const sequence = new Sequence(this.tween);
      const insert = (
        delayMs: number,
        durationMs: number,
        update: (progress: number) => void,
      ) => sequence.insert(delayMs, { durationMs, ease, update });

      // AVGShowItemCgSlot.Show (2791 @ 0x184242CE0) writes Unity localPosition.
      // Convert its upward Y to Pixi's downward Y at the rendering boundary.
      const { positionFrom, positionTo } = input;
      if (positionFrom && positionTo) {
        if (input.positionDurationMs > epsilon * 1000) {
          image.position.set(positionFrom.x, -positionFrom.y);
          insert(input.positionDelayMs, input.positionDurationMs, (progress) =>
            image.position.set(
              lerp(positionFrom.x, positionTo.x, progress),
              -lerp(positionFrom.y, positionTo.y, progress),
            ),
          );
        } else {
          image.position.set(positionTo.x, -positionTo.y);
        }
      }

      if (Math.abs(input.scaleFrom - input.scaleTo) > epsilon) {
        if (input.scaleDurationMs > epsilon * 1000) {
          image.scale.set(input.scaleFrom);
          insert(input.scaleDelayMs, input.scaleDurationMs, (progress) =>
            image.scale.set(lerp(input.scaleFrom, input.scaleTo, progress)),
          );
        } else {
          image.scale.set(input.scaleTo);
        }
      }

      if (input.colorFrom && input.colorTo) {
        if (input.alphaDurationMs > epsilon * 1000) {
          sprite.tint = rgb(input.colorFrom);
          sprite.alpha = input.colorFrom.a;
          insert(input.alphaDelayMs, input.alphaDurationMs, (progress) => {
            const color = {
              a: lerp(input.colorFrom!.a, input.colorTo!.a, progress),
              b: lerp(input.colorFrom!.b, input.colorTo!.b, progress),
              g: lerp(input.colorFrom!.g, input.colorTo!.g, progress),
              r: lerp(input.colorFrom!.r, input.colorTo!.r, progress),
            };
            sprite.tint = rgb(color);
            sprite.alpha = color.a;
          });
        } else {
          sprite.tint = rgb(input.colorTo);
          sprite.alpha = input.colorTo.a;
        }
      } else if (Math.abs(input.alphaFrom - input.alphaTo) > epsilon) {
        if (input.alphaDurationMs > epsilon * 1000) {
          sprite.alpha = input.alphaFrom;
          insert(input.alphaDelayMs, input.alphaDurationMs, (progress) => {
            sprite.alpha = lerp(input.alphaFrom, input.alphaTo, progress);
          });
        } else {
          sprite.alpha = input.alphaTo;
        }
      }

      // AVGShowItemCgSlot.Show uses Unity's upward Y for Rotate and DORotate.
      // Reflect its Z angle in Pixi. QuaternionPlugin.SetChangeValue
      // (2791 @ 0x184455A90) takes the shortest arc in RotateMode.Fast.
      if (input.rotationFrom <= epsilon) {
        if (input.rotationDurationMs > epsilon * 1000) {
          const start = -input.rotationFrom;
          const unityStart = ((input.rotationFrom % 360) + 360) % 360;
          let delta = ((input.rotationTo % 360) - unityStart) % 360;
          if (Math.abs(delta) > 180) delta -= 360 * Math.sign(delta);
          image.angle = start;
          insert(0, input.rotationDurationMs, (progress) => {
            image.angle = start - delta * progress;
          });
        } else {
          image.angle = -input.rotationTo;
        }
      }

      const finish = () => {
        if (state.show !== show) return;
        state.show = undefined;
        show.end();
        onComplete?.();
      };
      return sequence.play({
        // Sequence.DoStartup (2791 @ 0x18442C6F0) accepts an empty sequence
        // with OnComplete. Even a static CG can finish a command on update.
        deferZeroDuration: !isBlocker,
        isAlive: () => !root.destroyed,
        onComplete: finish,
      });
    };

    // 2791 blocker prefab (806 / Image 4251) is a centered stretch-anchored
    // sprite_white. _ShowItem calls Show with a null sprite and no callback.
    if (isBlocker) {
      void draw(Texture.WHITE, STORY_WIDTH, STORY_HEIGHT);
      return show;
    }
    const drawTexture = (texture: Texture | null) =>
      draw(texture, texture?.width ?? 0, texture?.height ?? 0);
    const texture = this.loadTexture(assetKey);
    const drawing =
      texture instanceof Promise
        ? texture.then(drawTexture)
        : drawTexture(texture);
    void drawing?.catch((error: unknown) => {
      if (state.show !== show) return;
      this.onWarning?.(`cgitem asset failed: ${assetKey}: ${String(error)}`);
      this.dispose(state);
    });
    return show;
  }

  shake(
    input: CgItemShakeInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const state = this.states.get(input.key);
    if (!state) {
      this.onWarning?.(`cgitemshake target not found: ${input.key}`);
      return;
    }
    // DOKill(complete:true) completes a finite shake. DOTween's
    // TweenManager.Complete (2791 @ 0x184462630) skips infinite loops, so a
    // replacement starts from their current offset.
    this.endShake(state, "force_end");
    if (input.durationMs === 0) return;

    const { x: startX, y: startY } = state.root.position;
    const handle = createExecutionHandle(input.block);
    state.shake = { handle, infinite: input.infinite, onComplete };
    const isCurrent = () => state.shake?.handle === handle;
    const path = buildShakePath(input.durationMs, {
      ...input,
      vectorBased: true,
    });
    void this.tween(
      input.durationMs,
      (progress) => {
        if (!isCurrent()) return;
        const { x, y } = sampleShakePath(path, progress);
        state.root.position.set(startX + x, startY - y);
      },
      () => {
        if (isCurrent()) this.endShake(state, "complete");
      },
      { isAlive: isCurrent, loops: input.infinite ? -1 : 1 },
    );
    return handle;
  }

  stopShakes(key?: string): void {
    if (key) {
      const state = this.states.get(key);
      if (state) this.stopShake(state);
      return;
    }
    for (const state of this.states.values()) this.stopShake(state);
  }

  private stopShake(state: CgItemState): void {
    this.endShake(state, "force_end");
    this.resetShakePosition(state);
  }

  private endShake(state: CgItemState, reason: ExecutionEndReason): void {
    const shake = state.shake;
    if (!shake) return;
    state.shake = undefined;
    if (reason === "complete" || (reason === "force_end" && !shake.infinite)) {
      this.resetShakePosition(state);
      // DOKill(complete:true) invokes the finite tween's OnComplete.
      shake.handle.end();
      shake.onComplete?.();
    } else shake.handle.end(reason);
  }

  private resetShakePosition(state: CgItemState): void {
    state.root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
  }

  hide(
    key: string | undefined,
    fadeMs: number,
    ease: string,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    if (this.states.size === 0) return;
    // _ClearItemByKey / _ClearAllItems stop root shakes before starting
    // the fade. Image-child position and scale tracks keep running.
    this.stopShakes(key);
    const easeCurve = dotweenEaseCurve(ease);
    if (key) {
      const state = this.states.get(key);
      // Web releases a missing-key wait. Native returns block and has
      // no slot callback to finish that command.
      if (!state) return;
      return this.fadeSlot(state, fadeMs, easeCurve, onComplete);
    }

    const entries = [...this.states.values()];
    this.states.clear();
    for (const state of entries) {
      this.fading.add(state);
      void this.fadeSlot(state, fadeMs, easeCurve);
    }
    // _ClearAllItems finishes the command as soon as all fades have started.
  }

  private fadeSlot(
    state: CgItemState,
    fadeMs: number,
    ease: EaseCurve,
    onComplete?: () => void,
  ): ExecutionHandle {
    // AVGShowItemCgSlot.Hide (2791 @ 0x184242970) leaves old tweens running.
    // _MakeAnimEndCb binds completion to the latest hide on this slot.
    const animEpoch = ++state.animEpoch;
    state.show?.end("reset");
    state.show = undefined;
    state.hide?.end("reset");
    const hide = createExecutionHandle(true);
    state.hide = hide;
    const isAlive = () => !state.root.destroyed;
    // DOTween reads the fade's starting alpha on its first update.
    let startAlpha: number | undefined;
    void this.tween(
      fadeMs,
      (progress) => {
        if (!isAlive()) return;
        startAlpha ??= state.root.alpha;
        state.root.alpha = lerp(startAlpha, 0, ease(progress));
      },
      () => {
        if (state.animEpoch !== animEpoch || !isAlive()) return;
        state.hide = undefined;
        this.dispose(state);
        hide.end();
        onComplete?.();
      },
      { deferZeroDuration: true, isAlive },
    );
    return hide;
  }

  /**
   * Roots registered under `key`: the live slot plus any clear-all slot
   * still fading out (see `fading`).
   */
  targets(key: string): Container[] {
    const state = this.states.get(key);
    const roots = state ? [state.root] : [];
    for (const state of this.fading)
      if (state.key === key) roots.push(state.root);
    return roots;
  }

  clear(): void {
    for (const state of this.states.values()) this.dispose(state);
    for (const state of this.fading) this.dispose(state);
    for (const state of this.unkeyed) this.dispose(state);
  }

  destroy(): void {
    this.clear();
  }

  private dispose(state: CgItemState): void {
    if (this.states.get(state.key) === state) this.states.delete(state.key);
    this.fading.delete(state);
    this.unkeyed.delete(state);
    this.endShake(state, "reset");
    state.show?.end("reset");
    state.show = undefined;
    state.hide?.end("reset");
    state.hide = undefined;
    if (state.key) this.lifecycle?.disposed(state.key, state.root);
    state.root.destroy({ children: true });
  }
}
