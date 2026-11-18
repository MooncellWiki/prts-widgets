import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import { normalizeImageKey } from "../asset";
import {
  exactArg,
  hasTweenDuration,
  toBoolean,
  toNumber,
  toString,
  tryConvertToInt32,
} from "../commandParams";
import {
  LOOP_BLOCK_WARNING,
  parseImageLayout,
  parseImageTween,
} from "../imageParams";

import type {
  ParsedCommandLine,
  RuntimeWarning,
  StoryRenderer,
} from "../types";

/** Torappu.AVG.AVGImagePanel (2791 GetExecutors @ 0x1841ABE60). */
export class ImagePanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      | "cancelImagePreparation"
      | "clearImage"
      | "resetImage"
      | "setImage"
      | "setImageRotate"
      | "setImageTween"
    >,
    private readonly calculateFadeMs: (seconds: unknown) => number,
    private readonly warn: (
      type: RuntimeWarning["type"],
      detail: string,
      line?: ParsedCommandLine,
    ) => void,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      image: (line) => this.show(line),
      imagerotate: (line) => this.rotate(line),
      imagetween: (line) => this.move(line),
    };
  }

  reset(): void {
    this.renderer.resetImage();
  }

  protected override forceCommandEnd(): void {
    // ForceCommandEnd / ShouldResetOnSkip (2791 @ 0x1841ABDF0 / 0x1841AC5A0)
    // leave the mounted slots and tweens alone. A Web load may still be pending.
    this.renderer.cancelImagePreparation();
  }

  /** _ExecuteImage (2791 @ 0x1841AD900) tests the raw time before animateRatio. */
  private show({ args }: ParsedCommandLine): ExecutorResult {
    const image = toString(exactArg(args, "image"));
    const key = normalizeImageKey(image);
    const seconds = toNumber(exactArg(args, "fadetime"));
    const fadeMs = this.calculateFadeMs(seconds);
    const block =
      hasTweenDuration(seconds) && toBoolean(exactArg(args, "block"), false);
    if (image && !key) this.warn("missing_asset", `image: ${image}`);
    const animation = key
      ? this.renderer.setImage(
          key,
          {
            ...parseImageLayout(args),
            block,
            fadeMs,
          },
          this.finishCommand,
        )
      : this.renderer.clearImage(fadeMs, block, this.finishCommand);
    // A cold load also returns a frame wait for a nonblocking command.
    return { animation, block: true };
  }

  /** _ExecuteImageTween (2791 @ 0x1841AD170) uses literal seconds. */
  private move(line: ParsedCommandLine): ExecutorResult {
    const { args } = line;
    const seconds = toNumber(exactArg(args, "duration"));
    const timed = hasTweenDuration(seconds);
    const block = timed && toBoolean(exactArg(args, "block"), false);
    const tween = parseImageTween(args);
    // Web adaptation: an infinite Restart loop cannot complete a frame wait.
    if (block && tween.loop)
      this.warn("invalid_parameter", LOOP_BLOCK_WARNING, line);
    const animation = this.renderer.setImageTween(
      {
        ...tween,
        block: block && !tween.loop,
        // Complete snaps a near-zero single pass. Infinite loops ignore Complete.
        durationMs: timed || tween.loop ? Math.max(0, seconds * 1000) : 0,
      },
      this.finishCommand,
    );
    return { animation, block: true };
  }

  /** _ExecuteImageRotate (2791 @ 0x1841ACD50) uses scaled time and Linear ease. */
  private rotate({ args }: ParsedCommandLine): ExecutorResult {
    const animation = this.renderer.setImageRotate(
      {
        angleDeg: toNumber(exactArg(args, "angle")),
        block: toBoolean(exactArg(args, "block"), false),
        // Command.TryGetParam<int> (2791 @ 0x18419AF30) uses Convert.ToInt32.
        // The Web player falls back to zero on conversion failure.
        circles: tryConvertToInt32(exactArg(args, "circles")) ?? 0,
        durationMs: this.calculateFadeMs(exactArg(args, "fadetime")),
        inverse: toBoolean(exactArg(args, "inverse"), false),
      },
      this.finishCommand,
    );
    return { animation, block: true };
  }
}
