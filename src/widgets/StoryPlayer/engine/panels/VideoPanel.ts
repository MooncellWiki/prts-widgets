import { ExecutorComponent, type PanelExecutors } from "../ExecutorComponent";
import { resolveStoryVideoByKey } from "../asset";
import { exactArg, toString } from "../commandParams";

import type { WaitForFrame } from "../commandRegistry";
import type { ParsedCommandLine, StoryRenderer } from "../types";

interface VideoPlayback {
  missingVideoUrls?: ReadonlySet<string>;
  waitForPlayback: (
    start: (onEnd: () => void) => void,
    stop: () => void,
  ) => WaitForFrame;
  warn: (type: "invalid_parameter" | "missing_asset", detail: string) => void;
}

/** Torappu.AVG.AVGVideoPanel.GetExecutors (2791 @ 0x1841BDCC0). */
export class VideoPanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<StoryRenderer, "playVideo" | "stopVideo">,
    private readonly playback: VideoPlayback,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return { video: (line) => this.executeVideo(line) };
  }

  private executeVideo({ args }: ParsedCommandLine): "continue" | WaitForFrame {
    // _ExecuteVideo / _PlayVideo (2791 @ 0x1841BE4F0 / 0x1841BEC90).
    // Web resolves relative keys via the CDN and accepts HTTP(S) URLs.
    const url = toString(exactArg(args, "url"));
    const res = toString(exactArg(args, "res"));
    const source = url || res;
    if (!source) {
      this.playback.warn("invalid_parameter", "video: no url or res");
      return "continue";
    }

    // VideoManager.CheckVideoExist (2791 @ 0x183E60170) gates the res branch.
    // The Web context HEAD-probes those assets before playback.
    const resolved = resolveStoryVideoByKey(source);
    if (!resolved || (!url && this.playback.missingVideoUrls?.has(resolved))) {
      this.playback.warn("missing_asset", `video: ${source}`);
      return "continue";
    }

    return this.playback.waitForPlayback(
      (onEnd) => this.renderer.playVideo(resolved, onEnd),
      () => this.renderer.stopVideo(),
    );
  }
}
