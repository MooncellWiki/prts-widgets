import { ExecutorComponent, type PanelExecutors } from "../ExecutorComponent";
import { getStoryVideoSource, resolveStoryVideoByKey } from "../asset";
import { getFiniteFloat } from "../commandParams";
import { createExecutionHandle, type ExecutionHandle } from "../execution";

import type { WaitForFrame } from "../commandRegistry";
import type { ParsedCommandLine, StoryRenderer } from "../types";

interface VideoPlayback {
  beginWait: () => void;
  finishAtFrameEnd: (
    handle: ExecutionHandle,
    finishCommand: () => void,
    afterForceEnd: () => void,
  ) => () => void;
  isSkipping: () => boolean;
  missingVideoUrls?: ReadonlySet<string>;
  warn: (type: "invalid_parameter" | "missing_asset", detail: string) => void;
}

/** Torappu.AVG.AVGVideoPanel.GetExecutors (2791 @ 0x1841BDCC0). */
export class VideoPanel extends ExecutorComponent {
  private cachedFadeOutDelayMs = 0;
  private cancelFrameEnd?: () => void;

  constructor(
    private readonly renderer: Pick<StoryRenderer, "playVideo" | "stopVideo">,
    private readonly playback: VideoPlayback,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return { video: (line, isCurrent) => this.executeVideo(line, isCurrent) };
  }

  reset(): void {
    this.cancelPendingCompletion();
    this.renderer.stopVideo();
  }

  /** OnFinish (2791 @ 0x1841BDDE0) uses the delay cached by _ExecuteVideo. */
  protected override onFinish(): void {
    this.renderer.stopVideo(this.cachedFadeOutDelayMs);
  }

  /** ForceCommandEnd (2791 @ 0x1841BDC40) starts the fade immediately. */
  protected override forceCommandEnd(): void {
    if (this.playback.isSkipping()) this.renderer.stopVideo(0);
    else this.reset();
  }

  private executeVideo(
    { args }: ParsedCommandLine,
    isCurrent = () => true,
  ): "continue" | WaitForFrame {
    // _ExecuteVideo / _PlayVideo (2791 @ 0x1841BE4F0 / 0x1841BEC90).
    // Web resolves relative keys via the CDN and accepts HTTP(S) URLs.
    this.cancelPendingCompletion();
    this.cachedFadeOutDelayMs =
      (getFiniteFloat(args, "fadeoutdelay") ?? 0) * 1000;

    const source = getStoryVideoSource(args);
    if (!source) {
      this.playback.warn("invalid_parameter", "video: no url or res");
      return "continue";
    }

    // VideoManager.CheckVideoExist (2791 @ 0x183E60170) gates the res branch.
    // Web HEAD-probes res assets and rejects empty media sources.
    const resolved = resolveStoryVideoByKey(source.key);
    if (!resolved) {
      const warning =
        source.kind === "url" ? "invalid_parameter" : "missing_asset";
      this.playback.warn(warning, `video: empty ${source.kind}`);
      return "continue";
    }
    if (
      source.kind === "res" &&
      this.playback.missingVideoUrls?.has(resolved)
    ) {
      this.playback.warn("missing_asset", `video: ${source.key}`);
      return "continue";
    }

    return this.play(resolved, isCurrent);
  }

  private play(url: string, isCurrent: () => boolean): WaitForFrame {
    const finish = createExecutionHandle(true);
    const forceEnd = () => {
      finish.end("force_end");
      this.forceCommandEnd();
    };

    this.playback.beginWait();
    try {
      this.renderer.playVideo(url, () => {
        if (
          finish.endReason !== undefined ||
          this.cancelFrameEnd ||
          !isCurrent()
        )
          return;
        // _HandlePlayEvent (2791 @ 0x1841BE7D0) queues FinishCommand.
        // A segment skip releases the wait, but the queued callback still
        // runs OnFinish if the same media is closing at frame end.
        this.cancelFrameEnd = this.playback.finishAtFrameEnd(
          finish,
          () => {
            this.cancelFrameEnd = undefined;
            this.finishCommand();
          },
          () => {
            this.cancelFrameEnd = undefined;
            this.onFinish();
          },
        );
      });
    } catch (error) {
      finish.end("force_end");
      this.reset();
      throw error;
    }

    if (!isCurrent()) forceEnd();
    return {
      forceEnd,
      isComplete: () => {
        if (finish.failure) throw finish.failure.error;
        return finish.endReason !== undefined;
      },
    };
  }

  private cancelPendingCompletion(): void {
    this.cancelFrameEnd?.();
    this.cancelFrameEnd = undefined;
  }
}
