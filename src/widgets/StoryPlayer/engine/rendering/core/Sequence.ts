import { linearEase, type EaseCurve } from "./DotweenEase";

import type { TweenRunner } from "./TweenRunner";

interface SequenceStep {
  durationMs: number;
  ease?: EaseCurve;
  update: (progress: number) => void;
}

interface ScheduledStep extends SequenceStep {
  startMs: number;
  finished: boolean;
}

interface SequencePlayback {
  deferZeroDuration?: boolean;
  isAlive?: () => boolean;
  onComplete?: () => void;
  /** Preserve write order when sticker tracks overlap on the same property. */
  sampleAllTracks?: boolean;
  timeScale?: number;
}

/**
 * DOTween Sequence.DoInsert / ApplyInternalCycle (2791 @ 0x18442C310 /
 * 0x18442B5B0). One TweenRunner advances all child tweens on the same clock.
 * An inserted delay may be negative. Append uses the current end of the
 * sequence and Join uses the last insertion point.
 */
export class Sequence {
  private readonly steps: ScheduledStep[] = [];
  private durationMs = 0;
  private lastInsertMs = 0;
  private playing = false;

  constructor(private readonly tween: TweenRunner["run"]) {}

  insert(startMs: number, step: SequenceStep): void {
    if (this.playing) return;
    const durationMs = Math.max(0, step.durationMs);
    this.steps.push({ ...step, durationMs, finished: false, startMs });
    this.lastInsertMs = startMs;
    this.durationMs = Math.max(this.durationMs, startMs + durationMs);
  }

  append(step: SequenceStep): void {
    this.insert(this.durationMs, step);
  }

  join(step: SequenceStep): void {
    this.insert(this.lastInsertMs, step);
  }

  play({
    deferZeroDuration = false,
    isAlive,
    onComplete,
    sampleAllTracks = false,
    timeScale = 1,
  }: SequencePlayback = {}): Promise<void> {
    if (this.playing || timeScale <= 0) return Promise.resolve();
    this.playing = true;
    // ApplyInternalCycle visits only tracks overlapping the elapsed interval.
    const steps = this.steps
      .filter((step) => sampleAllTracks || step.startMs + step.durationMs >= 0)
      .sort((a, b) => a.startMs - b.startMs);

    let lastElapsedMs: number | undefined;
    const update = (elapsedMs: number) => {
      if (isAlive?.() === false) return;
      lastElapsedMs = elapsedMs;
      for (const step of steps) {
        if (!sampleAllTracks && (step.finished || elapsedMs < step.startMs))
          continue;
        const progress =
          step.durationMs === 0
            ? 1
            : Math.max(
                0,
                Math.min(1, (elapsedMs - step.startMs) / step.durationMs),
              );
        step.update((step.ease ?? linearEase)(progress));
        step.finished = progress === 1;
      }
    };
    return this.tween(
      this.durationMs / timeScale,
      (progress) => update(progress * this.durationMs),
      () => {
        if (isAlive?.() === false) return;
        if (lastElapsedMs !== this.durationMs) update(this.durationMs);
        onComplete?.();
      },
      { deferZeroDuration, isAlive },
    );
  }
}
