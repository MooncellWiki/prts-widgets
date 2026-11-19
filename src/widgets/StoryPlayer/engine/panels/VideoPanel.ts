import { ExecutorComponent, type PanelExecutors } from "../ExecutorComponent";
import { getStoryVideoSource, resolveStoryVideoByKey } from "../asset";
import { getFiniteFloat } from "../commandParams";

import type { WaitForFrame } from "../commandRegistry";
import type { ParsedCommandLine } from "../types";

interface VideoPlayback {
  missingVideoUrls?: ReadonlySet<string>;
  waitForPlayback: (url: string, fadeOutDelayMs: number) => WaitForFrame;
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
    const source = getStoryVideoSource(args);
    if (!source) {
      this.playback.warn("invalid_parameter", "video: no url or res");
      return "continue";
    }

    // VideoManager.CheckVideoExist (2791 @ 0x183E60170) gates the res branch.
    // The Web context HEAD-probes those assets before playback.
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

    const fadeOutDelayMs =
      Math.max(0, getFiniteFloat(args, "fadeoutdelay") ?? 0) * 1000;
    return this.playback.waitForPlayback(resolved, fadeOutDelayMs);
  }
}
