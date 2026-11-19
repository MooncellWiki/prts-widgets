import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import {
  exactArg,
  hasTweenDuration,
  toBoolean,
  toNumber,
  toString,
} from "../commandParams";

import type { ParsedCommandLine, StoryRenderer } from "../types";

/** Torappu.AVG.AVGBlockerPanel (2791 GetExecutors @ 0x184184130). */
export class BlockerPanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "cancelBlockerPreparation" | "resetBlocker" | "setBlocker"
    >,
    private readonly calculateFadeMs: (
      seconds: unknown,
      fallback: number,
    ) => number,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return { blocker: (line) => this.show(line) };
  }

  reset(): void {
    this.renderer.resetBlocker();
  }

  protected override forceCommandEnd(): void {
    // 2791 ForceCommandEnd / ShouldResetOnSkip (0x1841840D0 / 0x184184510)
    // leave the mounted Image and DOColor running. Cancel any pending Web load.
    this.renderer.cancelBlockerPreparation();
  }

  /** _ExecuteBlocker (2791 @ 0x184184890) tests IsZero on the scaled fade. */
  private show({ args }: ParsedCommandLine): ExecutorResult {
    const styleArg = toString(exactArg(args, "style"), "defualt");
    const style =
      styleArg === "slider" || styleArg === "verticalslider"
        ? styleArg
        : "default";
    const scaledMs = this.calculateFadeMs(exactArg(args, "fadetime"), 0.4);
    const fadeMs = hasTweenDuration(scaledMs / 1000) ? scaledMs : 0;
    const animation = this.renderer.setBlocker(
      {
        block: fadeMs > 0 && toBoolean(exactArg(args, "block")),
        fadeMs,
        from: {
          a: toNumber(exactArg(args, "afrom"), Number.NaN),
          b: toNumber(exactArg(args, "bfrom"), Number.NaN),
          g: toNumber(exactArg(args, "gfrom"), Number.NaN),
          r: toNumber(exactArg(args, "rfrom"), Number.NaN),
        },
        image: toString(exactArg(args, "image")) || undefined,
        inverse: toBoolean(exactArg(args, "inverse")),
        style,
        to: {
          a: toNumber(exactArg(args, "a"), 1),
          b: toNumber(exactArg(args, "b"), 0),
          g: toNumber(exactArg(args, "g"), 0),
          r: toNumber(exactArg(args, "r"), 0),
        },
      },
      this.finishCommand,
    );
    // A cold texture also returns a wait when the color tween is nonblocking.
    return { animation, block: true };
  }
}
