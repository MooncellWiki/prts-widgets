import type { AnimationClock } from "../../execution";

interface SlotTween {
  startMs: number;
  endMs: number;
  step: (progress: number) => void;
  done?: () => void;
  finished: boolean;
}

/**
 * Forward playback for AVGCharacterslotPanel's cached DOTween Sequence
 * (2.7.91 _UpdateSeqWithTween @ 0x1841a9be0). The first update locks insertion.
 * Sequence.DoStartup stably sorts by insertion time, and ApplyInternalCycle
 * drives each child through its final sample before it stops writing.
 */
export class CharacterSlotSequence {
  private readonly startMs: number;
  private readonly tweens: SlotTween[] = [];
  private durationMs = 0;
  private started = false;
  private frameId: number | null;
  private onComplete?: () => void;
  private resolveCompletion!: () => void;
  readonly completion = new Promise<void>((resolve) => {
    this.resolveCompletion = resolve;
  });

  constructor(private readonly clock: AnimationClock) {
    this.startMs = clock.now();
    this.frameId = clock.requestFrame(this.update);
  }

  insert(
    startMs: number,
    durationMs: number,
    step: SlotTween["step"],
    done?: SlotTween["done"],
  ): boolean {
    if (this.started || this.frameId === null) return false;
    const endMs = startMs + durationMs;
    // DoInsert keeps signed offsets. A child ending before sequence time 0
    // is outside ApplyInternalCycle's forward playback window.
    if (endMs >= 0) {
      this.tweens.push({ startMs, endMs, step, done, finished: false });
      this.durationMs = Math.max(this.durationMs, endMs);
    }
    return true;
  }

  setOnComplete(onComplete: () => void): void {
    if (this.frameId !== null) this.onComplete = onComplete;
  }

  cancel(): void {
    if (this.frameId === null) return;
    this.clock.cancelFrame(this.frameId);
    this.finish();
  }

  private readonly update = (): void => {
    if (this.frameId === null) return;
    if (!this.started) {
      this.started = true;
      this.tweens.sort((a, b) => a.startMs - b.startMs);
    }

    const elapsedMs = Math.min(
      this.clock.now() - this.startMs,
      this.durationMs,
    );
    for (const tween of this.tweens) {
      if (tween.startMs > elapsedMs) break;
      if (tween.finished) continue;
      tween.finished = elapsedMs >= tween.endMs;
      tween.step(
        tween.finished
          ? 1
          : (elapsedMs - tween.startMs) / (tween.endMs - tween.startMs),
      );
      if (tween.finished) tween.done?.();
    }

    if (elapsedMs < this.durationMs) {
      this.frameId = this.clock.requestFrame(this.update);
    } else {
      this.onComplete?.();
      this.finish();
    }
  };

  private finish(): void {
    this.frameId = null;
    this.tweens.length = 0;
    this.onComplete = undefined;
    this.resolveCompletion();
  }
}
