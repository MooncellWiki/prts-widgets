import { ExecutorComponent, type PanelExecutors } from "../ExecutorComponent";
import { getStoryVideoSource, resolveStoryVideoByKey } from "../asset";
import { getFiniteFloat } from "../commandParams";

import type { WaitForFrame } from "../commandRegistry";
import type { ParsedCommandLine } from "../types";

interface VideoPlayback {
  missingVideoUrls?: ReadonlySet<string>;
  stopVideo: (fadeOutDelayMs: number) => void;
  waitForPlayback: (url: string, onFinish: () => void) => WaitForFrame;
  warn: (type: "invalid_parameter" | "missing_asset", detail: string) => void;
}

/** Torappu.AVG.AVGVideoPanel.GetExecutors (2791 @ 0x1841BDCC0). */
export class VideoPanel extends ExecutorComponent {
  constructor(private readonly playback: VideoPlayback) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return { video: (line) => this.executeVideo(line) };
  }

  private executeVideo({ args }: ParsedCommandLine): "continue" | WaitForFrame {
    // _ExecuteVideo / _PlayVideo (2791 @ 0x1841BE4F0 / 0x1841BEC90).
    // Web resolves relative keys via the CDN and accepts HTTP(S) URLs.
    const fadeOutDelayMs = (getFiniteFloat(args, "fadeoutdelay") ?? 0) * 1000;
    const onFinish = () => this.playback.stopVideo(fadeOutDelayMs);
    const finishUnavailable = (
      type: "invalid_parameter" | "missing_asset",
      detail: string,
    ): "continue" => {
      this.playback.warn(type, detail);
      // ExecutorComponent.Execute (2791 @ 0x18419B4F0) calls FinishCommand
      // inline when _ExecuteVideo returns false. OnFinish can hide a video
      // left mounted by the preceding command's delayed fade.
      onFinish();
      return "continue";
    };

    const source = getStoryVideoSource(args);
    if (!source)
      return finishUnavailable("invalid_parameter", "video: no url or res");

    // VideoManager.CheckVideoExist (2791 @ 0x183E60170) gates the res branch.
    // The Web context HEAD-probes those assets before playback.
    const resolved = resolveStoryVideoByKey(source.key);
    if (!resolved) {
      const warning =
        source.kind === "url" ? "invalid_parameter" : "missing_asset";
      return finishUnavailable(warning, `video: empty ${source.kind}`);
    }
    if (source.kind === "res" && this.playback.missingVideoUrls?.has(resolved))
      return finishUnavailable("missing_asset", `video: ${source.key}`);

    return this.playback.waitForPlayback(resolved, onFinish);
  }
}
