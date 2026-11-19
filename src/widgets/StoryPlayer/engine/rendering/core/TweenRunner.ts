import { browserAnimationClock, type AnimationClock } from "../../execution";

import { linearEase, type EaseCurve } from "./DotweenEase";

type SubscribeFrame = (update: (deltaMs: number) => void) => () => void;

/** Maximum Allowed Timestep in the 2791 PC TimeManager, in milliseconds. */
export const MAX_SCALED_FRAME_DELTA_MS = Math.fround(1 / 3) * 1000;

/** Optional timing and easing behaviour for {@link TweenRunner.run}. */
export interface TweenRunOptions {
  /** Run a zero-duration tween on the next update, like DOTween. */
  deferZeroDuration?: boolean;
  /**
   * Curve applied to each loop cycle's raw progress, mirroring DOTween's
   * `SetEase(ease)`; defaults to Linear.
   */
  ease?: EaseCurve;
  /**
   * Per-run liveness checked alongside the runner's own `isAlive` on every
   * frame. An invalid target cancels the tween.
   */
  isAlive?: () => boolean;
  /**
   * DOTween `SetLoops` count: 1 = single pass (default), negative = infinite
   * Restart loop that replays from the start value every cycle and never
   * completes (so `run` only settles once `isAlive` turns false — callers
   * must not block on it). Clamped like `SetLoops` @ 0x184885f00: 0 becomes a
   * single pass and anything below -1 becomes -1.
   */
  loops?: number;
  /** Upper limit on each elapsed frame, like Unity's scaled deltaTime. */
  maxFrameDeltaMs?: number;
  /** Measure elapsed time from run() using this monotonic clock. */
  now?: () => number;
}

export interface TweenStartOptions extends TweenRunOptions {
  /** DOTween's target identity for filtered operations. */
  target?: object;
  onComplete?: () => void;
  onCancel?: () => void;
  /** DOTween AutoKill callback, after the Update writes or on explicit kill. */
  onKill?: () => void;
}

export interface TweenHandle {
  /** Resolves when the tween stops. The reason is also available synchronously. */
  readonly completion: Promise<void>;
  readonly endReason: "complete" | "cancelled" | undefined;
  kill: (complete?: boolean) => void;
}

interface ActiveTween extends TweenHandle {
  target?: object;
  advance: (deltaMs: number) => void;
}

/**
 * Web frame adapter for DOTween's active tween lifecycle. 2791
 * TweenManager.Update (0x184467690) captures the iteration bounds at entry.
 * FilteredOperation (0x1844637F0) handles target kills in reverse order.
 */
export class TweenRunner {
  private readonly active = new Set<ActiveTween>();
  private readonly beforeUpdateCallbacks = new Set<() => void>();
  private readonly afterUpdateCallbacks: Array<() => void> = [];
  private stopUpdates: (() => void) | undefined;
  private updating = false;
  private killCallbacks?: Array<() => void>;

  constructor(
    private readonly isAlive: () => boolean,
    private readonly clock:
      AnimationClock | SubscribeFrame = browserAnimationClock,
  ) {}

  run(
    durationMs: number,
    step: (progress: number) => void,
    done?: () => void,
    options?: TweenRunOptions,
  ): Promise<void> {
    // Existing callers use done for both completion and teardown.
    return this.start(durationMs, step, {
      ...options,
      onComplete: done,
      onCancel: done,
    }).completion;
  }

  start(
    durationMs: number,
    step: (progress: number) => void,
    options: TweenStartOptions = {},
  ): TweenHandle {
    const ease = options.ease ?? linearEase;
    const requestedLoops = options.loops ?? 1;
    const loops =
      requestedLoops === 0 ? 1 : Math.max(-1, Math.trunc(requestedLoops));
    const totalMs = loops > 0 ? durationMs * loops : Number.POSITIVE_INFINITY;
    const isAlive = () => this.isAlive() && options.isAlive?.() !== false;
    const maxFrameDeltaMs = options.maxFrameDeltaMs ?? Number.POSITIVE_INFINITY;
    const clock = this.clock;
    const now =
      options.now ??
      (typeof clock === "function" ? undefined : () => clock.now());
    let previous = 0;
    let elapsed = 0;
    let killedDuringUpdate = false;
    let endReason: TweenHandle["endReason"];
    let resolve!: () => void;
    const completion = new Promise<void>((settle) => {
      resolve = settle;
    });
    const finish = (
      reason: Exclude<TweenHandle["endReason"], undefined>,
      finalProgress?: number,
    ) => {
      if (endReason !== undefined) return;
      endReason = reason;
      this.active.delete(tween);
      try {
        if (reason === "complete") {
          if (finalProgress !== undefined) step(finalProgress);
          options.onComplete?.();
        } else options.onCancel?.();
        if (options.onKill) {
          if (this.killCallbacks) this.killCallbacks.push(options.onKill);
          else options.onKill();
        }
      } finally {
        resolve();
        this.stopIfIdle();
      }
    };
    const tween: ActiveTween = {
      advance(deltaMs) {
        if (endReason !== undefined) return;
        if (killedDuringUpdate || !isAlive()) {
          finish("cancelled");
          return;
        }
        if (now) {
          const current = now();
          deltaMs = current - previous;
          previous = current;
        }
        elapsed += Math.min(deltaMs, maxFrameDeltaMs);
        // TweenManager.Update (2791 @ 0x1844679F0) counts one loop per
        // update for a zero duration, including an infinite loop.
        if (durationMs <= 0 && loops < 0) {
          step(ease(1));
          return;
        }
        if (durationMs <= 0 || elapsed >= totalMs) {
          finish("complete", ease(1));
          return;
        }
        // Tween.DoGoto (2791 @ 0x18443D350) samples the end pose on the
        // boundary. The next positive delta advances into the next cycle.
        const position = elapsed % durationMs;
        step(ease(position === 0 && elapsed > 0 ? 1 : position / durationMs));
      },
      completion,
      get endReason() {
        return endReason;
      },
      kill: (complete = false) => {
        // FilteredOperation (2791 @ 0x1844637F0) skips inactive tweens.
        if (endReason !== undefined || killedDuringUpdate) return;
        if (options.onKill && this.killCallbacks && !complete) {
          // Mark inactive now. Its next visit collects it for despawn,
          // including kills from OnKill.
          killedDuringUpdate = true;
          return;
        }
        // TweenManager.Complete (2791 @ 0x184462630) skips infinite loops.
        if (complete && loops > 0 && isAlive()) finish("complete", ease(1));
        else finish("cancelled");
      },
      target: options.target,
    };

    if (durationMs <= 0 && loops > 0 && !options.deferZeroDuration) {
      finish("complete", 1);
    } else {
      previous = now?.() ?? 0;
      this.active.add(tween);
      try {
        this.ensureUpdates();
      } catch (error) {
        this.active.delete(tween);
        throw error;
      }
    }
    return tween;
  }

  killTarget(target: object, complete = false): void {
    for (const tween of [...this.active].reverse()) {
      if (tween.target === target) tween.kill(complete);
    }
  }

  /** Run once before advancing tweens on the next Update. */
  beforeNextUpdate(callback: () => void): () => void {
    this.beforeUpdateCallbacks.add(callback);
    try {
      this.ensureUpdates();
    } catch (error) {
      this.beforeUpdateCallbacks.delete(callback);
      throw error;
    }
    return () => {
      this.beforeUpdateCallbacks.delete(callback);
      this.stopIfIdle();
    };
  }

  /** Run after the current tween update, or inline between frames. */
  afterUpdate(callback: () => void): void {
    if (this.updating) this.afterUpdateCallbacks.push(callback);
    else callback();
  }

  private update(deltaMs: number): void {
    this.updating = true;
    const kills: Array<() => void> = [];
    this.killCallbacks = kills;
    try {
      const tweens = [...this.active];
      for (const callback of [...this.beforeUpdateCallbacks]) {
        if (this.beforeUpdateCallbacks.delete(callback)) callback();
      }
      for (const tween of tweens) tween.advance(deltaMs);
    } finally {
      try {
        // TweenManager.Update (2791 @ 0x184467690) drains _KillList in reverse.
        while (kills.length > 0) kills.pop()!();
        this.killCallbacks = undefined;
        for (const callback of this.afterUpdateCallbacks) callback();
      } finally {
        this.killCallbacks = undefined;
        this.afterUpdateCallbacks.length = 0;
        this.updating = false;
        this.stopIfIdle();
      }
    }
  }

  private ensureUpdates(): void {
    if (this.stopUpdates || this.updating) return;
    this.stopUpdates = this.subscribe();
    this.stopIfIdle();
  }

  private stopIfIdle(): void {
    if (this.updating || this.active.size || this.beforeUpdateCallbacks.size)
      return;
    this.stopUpdates?.();
    this.stopUpdates = undefined;
  }

  private subscribe(): () => void {
    const clock = this.clock;
    if (typeof clock === "function")
      return clock((deltaMs) => this.update(deltaMs));

    let stopped = false;
    const tick = () => {
      if (stopped) return;
      this.update(0);
      if (!stopped) frame = clock.requestFrame(tick);
    };
    let frame = clock.requestFrame(tick);
    return () => {
      stopped = true;
      clock.cancelFrame(frame);
    };
  }
}
