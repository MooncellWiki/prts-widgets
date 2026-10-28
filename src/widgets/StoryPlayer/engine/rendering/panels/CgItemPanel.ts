import { Container, Sprite, type Texture } from "pixi.js";

import { STORY_HEIGHT, STORY_WIDTH, type CgItemInput } from "../../types";
import { dotweenEaseCurve } from "../core/DotweenEase";

type TextureLoader = (key: string) => Promise<Texture | null>;
type Tween = (
  durationMs: number,
  update: (progress: number) => void,
  complete?: () => void,
) => Promise<void>;

interface CgItemState {
  /**
   * `AVGShowItemCgSlot.m_animEpoch`: every `Hide` re-binds the slot's
   * `_onAnimEnd` and bumps the epoch through `_MakeAnimEndCb`, so only the
   * latest hide on a slot may complete it.
   */
  hideEpoch: number;
  root: Container;
  sessionId: number;
  sprite: Sprite | null;
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
  disposed: (key: string) => void;
  registered: (key: string) => void;
}

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
 * Port scope: `Torappu.AVG.AVGCgItemPanel._ExecuteShowCgItem` and
 * `_ExecuteHideCgItem`, including independent delayed tracks and clear-all's
 * non-blocking completion. PIXI sprites substitute for `AVGShowItemCgSlot`.
 *
 * The command's `layer` parameter is deliberately not modelled: although
 * `AVGShowItemCgSlot.Show` reads it, it only reaches `_OverrideLayer` behind
 * `m_overrideLayer`, and the sole caller of `SetOverrideLayer` is
 * `AVGReaderModeCgItemView._ShowItem`. During normal playback the flag stays
 * false, so stacking follows slot instantiation order -- which is what adding
 * each root to `layer` in command order already reproduces.
 */
export class CgItemPanel {
  private readonly states = new Map<string, CgItemState>();
  /**
   * Clear-all slots still fading out, mapped to their key. Native
   * `_ClearAllItems` empties `m_slotsInUseDict` at once but only disposes
   * each slot at its fade end, so until then the slot stays registered with
   * the PostDisplay processors (focus effects keep applying).
   */
  private readonly fading = new Map<CgItemState, string>();

  constructor(
    private readonly layer: Container,
    private readonly loadTexture: TextureLoader,
    private readonly tween: Tween,
    private readonly onWarning?: (detail: string) => void,
    private readonly lifecycle?: CgItemLifecycle,
  ) {}

  async show(input: CgItemInput): Promise<void> {
    // Native provenance: `AVGCgItemPanel._ShowItem` (0x183e35d80, 2.7.61)
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
    this.dispose(input.key);
    const root = new Container();
    root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    this.layer.addChild(root);
    const state: CgItemState = {
      hideEpoch: 0,
      root,
      sessionId: 1,
      sprite: null,
    };
    this.states.set(input.key, state);
    this.lifecycle?.registered(input.key);
    const sessionId = state.sessionId;

    const completion = this.loadTexture(input.assetKey).then((texture) => {
      // The slot was replaced, hidden, or cleared while the texture was in
      // flight: drop the frames instead of resurrecting a destroyed root.
      if (this.states.get(input.key) !== state) return;
      if (state.sessionId !== sessionId) return;
      if (!texture) {
        // Web adaptation: native would keep an empty registered slot; the
        // frontend undoes the pending registration so a failed load leaves
        // no invisible target behind (the missing asset is already warned).
        this.onWarning?.(`cgitem asset is missing: ${input.assetKey}`);
        this.dispose(input.key);
        return;
      }

      const sprite = new Sprite(texture);
      state.sprite = sprite;
      sprite.anchor.set(0.5);
      sprite.setSize(texture.width, texture.height);
      root.addChild(sprite);

      if (input.width > 0 && input.height > 0)
        sprite.setSize(input.width, input.height);

      // `AVGShowItemCgSlot.Show` (2.7.81 0x18405dde0) reads the curve with
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
        const totalMs = Math.max(0, delayMs) + Math.max(0, durationMs);
        runs.push(
          this.tween(totalMs, (raw) => {
            if (state.sessionId !== sessionId) return;
            const elapsed = raw * totalMs;
            const local =
              durationMs <= 0
                ? 1
                : Math.max(0, Math.min(1, (elapsed - delayMs) / durationMs));
            update(ease(local));
          }),
        );
      };

      // `Torappu.AVG.AVGShowItemCgSlot.Show` drives Transform.localPosition and
      // `_GenPosByRaw` keeps the raw y sign. PIXI uses sprite.position as the
      // coordinate-system adaptation, so do not inherit sticker's UI-y inversion.
      if (input.positionFrom && input.positionTo) {
        if (input.positionDurationMs > 0) {
          sprite.position.set(input.positionFrom.x, input.positionFrom.y);
          run(input.positionDelayMs, input.positionDurationMs, (progress) =>
            sprite.position.set(
              lerp(input.positionFrom!.x, input.positionTo!.x, progress),
              lerp(input.positionFrom!.y, input.positionTo!.y, progress),
            ),
          );
        } else {
          sprite.position.set(input.positionTo.x, input.positionTo.y);
        }
      }

      if (input.scaleFrom !== input.scaleTo) {
        if (input.scaleDurationMs > 0) {
          sprite.scale.set(input.scaleFrom);
          run(input.scaleDelayMs, input.scaleDurationMs, (progress) =>
            sprite.scale.set(lerp(input.scaleFrom, input.scaleTo, progress)),
          );
        } else {
          sprite.scale.set(input.scaleTo);
        }
      }

      if (input.colorFrom && input.colorTo) {
        if (input.alphaDurationMs > 0) {
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
      } else if (input.alphaFrom !== input.alphaTo) {
        if (input.alphaDurationMs > 0) {
          sprite.alpha = input.alphaFrom;
          run(input.alphaDelayMs, input.alphaDurationMs, (progress) => {
            sprite.alpha = lerp(input.alphaFrom, input.alphaTo, progress);
          });
        } else {
          sprite.alpha = input.alphaTo;
        }
      }

      // Native provenance: `AVGShowItemCgSlot.Show` (not the panel) gates its
      // whole rotation block on `!MathUtil.GT(rfrom, 0)`, i.e. `rfrom <= 0`, so
      // the default `rfrom = -1` always takes it and an explicit positive `rfrom`
      // disables rotation entirely. `Transform.Rotate` is relative while
      // `DORotate(..., RotateMode.Fast)` targets an absolute angle; a fresh
      // sprite sits at 0, so `+= rfrom` then tween to `rto` reproduces both.
      if (input.rotationFrom <= 0) {
        if (input.rotationDurationMs > 0) {
          sprite.angle += input.rotationFrom;
          run(0, input.rotationDurationMs, (progress) => {
            sprite.angle = lerp(input.rotationFrom, input.rotationTo, progress);
          });
        } else {
          sprite.angle += input.rotationTo;
        }
      }

      return Promise.all(runs).then(() => {});
    });

    // `block=true` waits for the sprite work AND every track (native awaits
    // the whole Sequence; the texture wait is the web-only extra).
    if (input.block) await completion;
    else void completion;
  }

  async hide(
    key: string | undefined,
    fadeMs: number,
    ease: string,
    block: boolean,
  ): Promise<void> {
    // Native provenance (2.7.81 `_ExecuteHideCgItem` 0x183fb05e0 /
    // `_ClearAllItems` 0x183fafbc0): before fading, native unconditionally
    // runs `_StopShakeByKey(key)` (keyed path) / `_StopAllShakes()` (clear
    // all) -- DOKill(complete) on the slot ROOT transform plus zeroing its
    // anchoredPosition/localPosition. Without `cgitemshake` (not ported, 0
    // corpus uses) that kills nothing, and the root already sits at its
    // authored origin, so the step is a visual no-op that the port skips;
    // the show-side pfrom/pto tween lives on the image child, not the root,
    // and keeps driving during the fade either way. Revisit if/when
    // cgitemshake is ported.
    if (this.states.size === 0) return;
    // `AVGShowItemCgSlot.Hide` uses the same `GetEnum<Ease>` resolution
    // (`(Ease)1` = Ease.Linear default) as Show.
    const easeCurve = dotweenEaseCurve(ease);
    if (key) {
      const state = this.states.get(key);
      // Native divergence: with `block=true` and a missing key the native
      // executor returns true while nobody ever calls `FinishCommand`
      // (`_ClearItemByKey` returns silently), so the panel stays suspended
      // until skip/`ForceCommandEnd` rescues it -- a native defect, not
      // behaviour worth reproducing. The Web port releases immediately.
      if (!state) return;
      // Native provenance: the hide path performs no DOKill -- base
      // `AVGShowItemSlot.Hide` (2.7.81 0x184060370) only stores the
      // callback, and the CG slot's `_MakeAnimEndCb` epoch bump merely mutes
      // the show sequence's OnComplete -- so the show-side sequence keeps
      // driving position/scale while the fade runs and until the completing
      // `Dispose` destroys the slot. Do NOT bump `sessionId` here (that
      // would freeze those writes); only snapshot it so the completion
      // callback stays inert when a newer `show` has replaced the slot
      // mid-fade (replacement bumps the id in `dispose`).
      const sessionAtHide = state.sessionId;
      // `AVGShowItemCgSlot.Hide` (2.7.81 0x18405da70) starts a fresh DOFade
      // without killing an earlier one and completes through
      // `_MakeAnimEndCb` (0x18405ee40), whose callback only fires while its
      // epoch is still current. A second hide on the same key (or a later
      // clear-all) therefore mutes this fade's completion: the slot is
      // disposed when the latest fade ends, not the first.
      const hideEpoch = ++state.hideEpoch;
      const startAlpha = state.root.alpha;
      const task = this.tween(
        fadeMs,
        (raw) => {
          state.root.alpha = lerp(startAlpha, 0, easeCurve(raw));
        },
        () => {
          if (
            state.hideEpoch === hideEpoch &&
            state.sessionId === sessionAtHide
          )
            this.dispose(key);
        },
      );
      if (block) await task;
      else void task;
      return;
    }

    const entries = [...this.states.entries()];
    this.states.clear();
    for (const [key, state] of entries) {
      // `_ClearAllItems` hides every slot through the same `Hide`, so an
      // in-flight keyed hide loses its completion here as well; otherwise it
      // would `dispose` whatever a later `show` registers under that key.
      state.hideEpoch += 1;
      this.fading.set(state, key);
      const startAlpha = state.root.alpha;
      void this.tween(
        fadeMs,
        (raw) => {
          if (!this.fading.has(state)) return;
          state.root.alpha = lerp(startAlpha, 0, easeCurve(raw));
        },
        () => {
          // `clear()` may already have destroyed the slot.
          if (!this.fading.delete(state)) return;
          // During the fade show-side writes keep running (native drives the
          // slots until `Dispose`); once the fade completes, bump the session
          // to stop writes into the destroyed sprite.
          state.sessionId += 1;
          state.root.destroy({ children: true });
          // Native `BeforeItemDisposed` removes the channel's stored focus
          // amount by key, which would also strip a newer slot that `show`
          // registered under the same key mid-fade and orphan it from later
          // `focusout` writes -- a native defect; keep the newer slot bound.
          if (!this.states.has(key)) this.lifecycle?.disposed(key);
        },
      );
    }
    // `_ExecuteHideCgItem` completes clear-all immediately even if `block=true`.
  }

  /**
   * Roots registered under `key`: the live slot plus any clear-all slot
   * still fading out (see `fading`).
   */
  targets(key: string): Container[] {
    const state = this.states.get(key);
    const roots = state ? [state.root] : [];
    for (const [fadingState, fadingKey] of this.fading)
      if (fadingKey === key) roots.push(fadingState.root);
    return roots;
  }

  clear(): void {
    const keys = new Set([...this.states.keys(), ...this.fading.values()]);
    for (const state of [...this.states.values(), ...this.fading.keys()]) {
      state.sessionId += 1;
      state.root.destroy({ children: true });
    }
    this.states.clear();
    this.fading.clear();
    for (const key of keys) this.lifecycle?.disposed(key);
  }

  destroy(): void {
    this.clear();
  }

  private dispose(key: string): void {
    const state = this.states.get(key);
    if (!state) return;
    state.sessionId += 1;
    state.root.destroy({ children: true });
    this.states.delete(key);
    this.lifecycle?.disposed(key);
  }
}
