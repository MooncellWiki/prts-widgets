import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import { normalizeImageKey } from "../asset";
import { exactArg, toBoolean, toNumber, toString } from "../commandParams";
import { parseImageLayout, parseImageTween } from "../imageParams";
import { LOOP_BLOCK_WARNING } from "../puzzleCommands";

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
      "clearImage" | "setImage" | "setImageTween" | "setImageRotate"
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

  /** _ExecuteImage (2791 @ 0x1841AD900). */
  private async show({ args }: ParsedCommandLine): Promise<ExecutorResult> {
    const image = toString(exactArg(args, "image"));
    const key = normalizeImageKey(image);
    const fadeMs = this.calculateFadeMs(exactArg(args, "fadetime"));
    const block = fadeMs > 0 && toBoolean(exactArg(args, "block"), false);
    if (key) {
      await this.renderer.setImage(key, {
        ...parseImageLayout(args),
        block,
        fadeMs,
      });
    } else {
      if (image) this.warn("missing_asset", `image: ${image}`);
      await this.renderer.clearImage(fadeMs, block);
    }
    return "continue";
  }

  /** _ExecuteImageTween (2791 @ 0x1841AD170) uses literal seconds. */
  private async move(line: ParsedCommandLine): Promise<ExecutorResult> {
    const { args } = line;
    const durationMs = Math.max(0, toNumber(exactArg(args, "duration")) * 1000);
    const block = durationMs > 0 && toBoolean(exactArg(args, "block"), false);
    const tween = parseImageTween(args);
    // Web adaptation: an infinite Restart loop cannot complete a frame wait.
    if (block && tween.loop)
      this.warn("invalid_parameter", LOOP_BLOCK_WARNING, line);
    await this.renderer.setImageTween({
      ...tween,
      block: block && !tween.loop,
      durationMs,
    });
    return "continue";
  }

  /** _ExecuteImageRotate (2791 @ 0x1841ACD50) uses scaled time and Linear ease. */
  private async rotate({ args }: ParsedCommandLine): Promise<ExecutorResult> {
    await this.renderer.setImageRotate({
      angleDeg: toNumber(exactArg(args, "angle")),
      block: toBoolean(exactArg(args, "block"), false),
      circles: Math.trunc(toNumber(exactArg(args, "circles"))),
      durationMs: this.calculateFadeMs(exactArg(args, "fadetime")),
      inverse: toBoolean(exactArg(args, "inverse"), false),
    });
    return "continue";
  }
}
