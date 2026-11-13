import { Container, Sprite, Texture } from "pixi.js";

import { createExecutionHandle, type ExecutionHandle } from "../../execution";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type CgItemInput,
  type CgItemShakeInput,
} from "../../types";
import { dotweenEaseCurve } from "../core/DotweenEase";
import { canvasOrderForLayer, sceneCanvasOrder } from "../core/LayerGraph";
import { buildShakePath, sampleShakePath } from "../core/ShakePath";

import type { TweenRunOptions } from "../core/TweenRunner";

type TextureLoader = (key: string) => Promise<Texture | null>;
type Tween = (
  durationMs: number,
  update: (progress: number) => void,
  complete?: () => void,
  options?: TweenRunOptions,
) => Promise<void>;

interface CgItemState {
  /**
   * `AVGShowItemCgSlot.m_animEpoch`: every `Hide` re-binds the slot's
   * `_onAnimEnd` and bumps the epoch through `_MakeAnimEndCb`, so only the
   * latest hide on a slot may complete it.
   */
  hideEpoch: number;
  key: string;
  root: Container;
  sessionId: number;
  shake?: ExecutionHandle;
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
    private readonly loadTexture: TextureLoader,
    private readonly tween: Tween,
    private readonly onWarning?: (detail: string) => void,
    private readonly lifecycle?: CgItemLifecycle,
  ) {
    this.layer.sortableChildren = true;
  }

  async show(input: CgItemInput): Promise<void> {
    // Native provenance: `AVGCgItemPanel._ShowItem` (2791 @ 0x18418ABF0)
    // instantiates the new slot, instantly `Dispose()`s the previous same-key
    // entry (no fade), and writes the new entry into `m_slotsInUseDict`
    // BEFORE any sprite work. Its `_LoadSprite` is a synchronous cached load
    // (assets are preloaded via `InternalResRefCollector.GatherResRefs`), so
    // the executor never waits on I/O. The web port mirrors the command-side
    // ordering -- dispose old, register the placeholder root -- and only then
    // starts the asynchronous texture load, so uncached assets stay off the
    // command critical path (block=false returns before the bytes arrive) and
    // a `hidecgitem` arriving mid-load still finds the key instead of leaking
    // the sprite.
    const { assetKey, key } = input;
    const oldState = this.states.get(key);
    if (oldState) this.dispose(oldState);
    const root = new Container();
    root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    root.zIndex = canvasOrderForLayer(sceneCanvasOrder.cgitem, input.layer);
    this.layer.addChild(root);
    const state: CgItemState = {
      hideEpoch: 0,
      key,
      root,
      sessionId: 1,
    };
    if (key) {
      this.states.set(key, state);
      this.lifecycle?.registered(key, root);
    } else {
      this.unkeyed.add(state);
    }
    const sessionId = state.sessionId;

    const draw = (texture: Texture | null, width: number, height: number) => {
      // The slot was replaced, hidden, or cleared while the texture was in
      // flight: drop the frames instead of resurrecting a destroyed root.
      if (key && this.states.get(key) !== state) return;
      if (state.sessionId !== sessionId) return;
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
        width = input.width;
        height = input.height;
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
      const runs: Promise<void>[] = [];
      const run = (
        delayMs: number,
        durationMs: number,
        update: (progress: number) => void,
      ) => {
        const totalMs = delayMs + durationMs;
        runs.push(
          this.tween(totalMs, (raw) => {
            if (state.sessionId !== sessionId) return;
            const elapsed = raw * totalMs;
            const local = Math.max(
              0,
              Math.min(1, (elapsed - delayMs) / durationMs),
            );
            update(ease(local));
          }),
        );
      };

      // AVGShowItemCgSlot.Show (2791 @ 0x184242CE0) writes Unity localPosition.
      // Convert its upward Y to Pixi's downward Y at the rendering boundary.
      const { positionFrom, positionTo } = input;
      if (positionFrom && positionTo) {
        if (input.positionDurationMs > epsilon * 1000) {
          image.position.set(positionFrom.x, -positionFrom.y);
          run(input.positionDelayMs, input.positionDurationMs, (progress) =>
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
          run(input.scaleDelayMs, input.scaleDurationMs, (progress) =>
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
          run(input.alphaDelayMs, input.alphaDurationMs, (progress) => {
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
          run(input.alphaDelayMs, input.alphaDurationMs, (progress) => {
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
          run(0, input.rotationDurationMs, (progress) => {
            image.angle = start - delta * progress;
          });
        } else {
          image.angle = -input.rotationTo;
        }
      }

      return Promise.all(runs).then(() => {});
    };

    // 2791 blocker prefab (806 / Image 4251) is a centered stretch-anchored
    // sprite_white. _ShowItem calls Show with a null sprite and no callback.
    if (assetKey === undefined) {
      void draw(Texture.WHITE, STORY_WIDTH, STORY_HEIGHT);
      return;
    }
    const completion = this.loadTexture(assetKey).then((texture) => {
      return draw(texture, texture?.width ?? 0, texture?.height ?? 0);
    });

    // `block=true` waits for the sprite work AND every track (native awaits
    // the whole Sequence; the texture wait is the web-only extra).
    if (input.block) await completion;
    else void completion;
  }

  async shake(input: CgItemShakeInput): Promise<void> {
    const state = this.states.get(input.key);
    if (!state) {
      this.onWarning?.(`cgitemshake target not found: ${input.key}`);
      return;
    }
    // DOKill(complete:true) completes a finite shake. DOTween's
    // TweenManager.Complete (2791 @ 0x184462630) skips infinite loops, so a
    // replacement starts from their current offset.
    state.shake?.end("force_end");
    if (input.durationMs === 0) return;

    const { x: startX, y: startY } = state.root.position;
    const handle = createExecutionHandle(input.block, (reason) => {
      state.shake = undefined;
      if (reason === "complete" || !input.infinite)
        this.resetShakePosition(state);
    });
    state.shake = handle;
    const isCurrent = () => state.shake === handle;
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
        if (isCurrent()) handle.end();
      },
      { isAlive: isCurrent, loops: input.infinite ? -1 : 1 },
    );
    if (handle.blocking) await handle.completion;
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
    state.shake?.end("force_end");
    this.resetShakePosition(state);
  }

  private resetShakePosition(state: CgItemState): void {
    state.root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
  }

  async hide(
    key: string | undefined,
    fadeMs: number,
    ease: string,
    block: boolean,
  ): Promise<void> {
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
      // AVGShowItemCgSlot.Hide (2791 @ 0x184242970) lets earlier fades
      // keep writing but _MakeAnimEndCb only completes the current hide.
      const hideEpoch = ++state.hideEpoch;
      const startAlpha = state.root.alpha;
      const task = this.tween(
        fadeMs,
        (raw) => {
          if (!state.root.destroyed)
            state.root.alpha = lerp(startAlpha, 0, easeCurve(raw));
        },
        () => {
          if (state.hideEpoch === hideEpoch && this.states.get(key) === state)
            this.dispose(state);
        },
      );
      if (block) await task;
      else void task;
      return;
    }

    const entries = [...this.states.values()];
    this.states.clear();
    for (const state of entries) {
      // `_ClearAllItems` hides every slot through the same `Hide`, so an
      // in-flight keyed hide loses its completion here as well; otherwise it
      // would `dispose` whatever a later `show` registers under that key.
      state.hideEpoch += 1;
      this.fading.add(state);
      const startAlpha = state.root.alpha;
      void this.tween(
        fadeMs,
        (raw) => {
          if (!this.fading.has(state)) return;
          state.root.alpha = lerp(startAlpha, 0, easeCurve(raw));
        },
        () => {
          if (this.fading.has(state)) this.dispose(state);
        },
      );
    }
    // _ClearAllItems finishes the command as soon as all fades have started.
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
    state.shake?.end("reset");
    state.sessionId += 1;
    if (state.key) this.lifecycle?.disposed(state.key, state.root);
    state.root.destroy({ children: true });
  }
}
