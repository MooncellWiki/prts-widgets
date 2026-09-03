import { Container, Sprite, type Texture } from "pixi.js";

import { STORY_HEIGHT, STORY_WIDTH, type CgItemInput } from "../../types";

type TextureLoader = (key: string) => Promise<Texture | null>;
type Tween = (
  durationMs: number,
  update: (progress: number) => void,
  complete?: () => void,
) => Promise<void>;

interface CgItemState {
  root: Container;
  sessionId: number;
  sprite: Sprite;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function colorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function easeProgress(raw: number, ease: string): number {
  switch (ease.toLowerCase()) {
    case "inquad": {
      return raw * raw;
    }
    case "inoutquad": {
      return raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
    }
    case "insine": {
      return 1 - Math.cos((raw * Math.PI) / 2);
    }
    case "outquad": {
      return 1 - (1 - raw) * (1 - raw);
    }
    // `AVGShowItemCgSlot.Show` / `.Hide` read the curve with
    // `GetEnum<Ease>(param, "ease", (Ease)1, ignoreCase: false)`: the default
    // is DOTween `Ease` enum value 1 = InSine (`Ease.Linear` is 0), and the
    // parser returns that same default for any name it cannot resolve. The
    // Web port maps only corpus-attested names and keeps a linear fallback
    // for the rest (hidecgitem lines never write `ease` explicitly).
    default: {
      return raw;
    }
  }
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

  constructor(
    private readonly layer: Container,
    private readonly loadTexture: TextureLoader,
    private readonly tween: Tween,
    private readonly onWarning?: (detail: string) => void,
  ) {}

  async show(input: CgItemInput): Promise<void> {
    const texture = await this.loadTexture(input.assetKey);
    if (!texture) {
      this.onWarning?.(`cgitem asset is missing: ${input.assetKey}`);
      return;
    }

    this.dispose(input.key);
    const root = new Container();
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.setSize(texture.width, texture.height);
    root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    root.addChild(sprite);
    this.layer.addChild(root);
    const state = { root, sessionId: 1, sprite };
    this.states.set(input.key, state);
    const sessionId = state.sessionId;

    if (input.width > 0 && input.height > 0)
      sprite.setSize(input.width, input.height);

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
          update(easeProgress(local, input.ease));
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

    const completion = Promise.all(runs).then(() => {});
    if (input.block) await completion;
    else void completion;
  }

  async hide(
    key: string | undefined,
    fadeMs: number,
    ease: string,
    block: boolean,
  ): Promise<void> {
    if (this.states.size === 0) return;
    if (key) {
      const state = this.states.get(key);
      // Native divergence: with `block=true` and a missing key the native
      // executor returns true while nobody ever calls `FinishCommand`
      // (`_ClearItemByKey` returns silently), so the panel stays suspended
      // until skip/`ForceCommandEnd` rescues it -- a native defect, not
      // behaviour worth reproducing. The Web port releases immediately.
      if (!state) return;
      // Native provenance: the hide path performs no DOKill -- base
      // `AVGShowItemSlot.Hide` (0x183ed3cf0) only stores the callback -- so
      // the show-side sequence keeps driving position/scale while the fade
      // runs and until the completing `Dispose` destroys the slot. Do NOT
      // bump `sessionId` here (that would freeze those writes); only snapshot
      // it so the completion callback stays inert when a newer `show` has
      // replaced the slot mid-fade (replacement bumps the id in `dispose`).
      const sessionAtHide = state.sessionId;
      const startAlpha = state.root.alpha;
      const task = this.tween(
        fadeMs,
        (raw) => {
          state.root.alpha = lerp(startAlpha, 0, easeProgress(raw, ease));
        },
        () => {
          if (state.sessionId === sessionAtHide) this.dispose(key);
        },
      );
      if (block) await task;
      else void task;
      return;
    }

    const entries = [...this.states.entries()];
    this.states.clear();
    for (const [, state] of entries) {
      const startAlpha = state.root.alpha;
      void this.tween(
        fadeMs,
        (raw) => {
          state.root.alpha = lerp(startAlpha, 0, easeProgress(raw, ease));
        },
        () => {
          // During the fade show-side writes keep running (native drives the
          // slots until `Dispose`); once the fade completes, bump the session
          // to stop writes into the destroyed sprite.
          state.sessionId += 1;
          state.root.destroy({ children: true });
        },
      );
    }
    // `_ExecuteHideCgItem` completes clear-all immediately even if `block=true`.
  }

  targets(key: string): Container[] {
    if (!key) return [...this.states.values()].map((state) => state.root);
    const state = this.states.get(key);
    return state ? [state.root] : [];
  }

  clear(): void {
    for (const state of this.states.values())
      state.root.destroy({ children: true });
    this.states.clear();
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
  }
}
