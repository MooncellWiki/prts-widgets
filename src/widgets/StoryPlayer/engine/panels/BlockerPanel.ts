import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import {
  boxedParamString,
  exactArg,
  getBool,
  getFiniteFloat,
} from "../commandParams";

import type { ParsedCommandLine, StoryRenderer } from "../types";

/** Torappu.AVG.AVGBlockerPanel (2791 GetExecutors @ 0x184184130). */
export class BlockerPanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "cancelBlockerPreparation" | "resetBlocker" | "setBlocker"
    >,
    private readonly calculateFadeMs: (seconds: number) => number,
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
    const styleArg = boxedParamString(exactArg(args, "style"));
    const style =
      styleArg === "slider" || styleArg === "verticalslider"
        ? styleArg
        : "default";
    // GetFloat and GetBool use Convert.ToSingle and Convert.ToBoolean in 2791.
    const fadeMs = this.calculateFadeMs(
      getFiniteFloat(args, "fadetime") ?? 0.4,
    );
    const animation = this.renderer.setBlocker(
      {
        block: fadeMs !== 0 && getBool(args, "block"),
        fadeMs,
        from: {
          a: getFiniteFloat(args, "afrom") ?? Number.NaN,
          b: getFiniteFloat(args, "bfrom") ?? Number.NaN,
          g: getFiniteFloat(args, "gfrom") ?? Number.NaN,
          r: getFiniteFloat(args, "rfrom") ?? Number.NaN,
        },
        image: boxedParamString(exactArg(args, "image")) || undefined,
        inverse: getBool(args, "inverse"),
        style,
        to: {
          a: getFiniteFloat(args, "a") ?? 1,
          b: getFiniteFloat(args, "b") ?? 0,
          g: getFiniteFloat(args, "g") ?? 0,
          r: getFiniteFloat(args, "r") ?? 0,
        },
      },
      this.finishCommand,
    );
    // A cold texture also returns a wait when the color tween is nonblocking.
    return { animation, block: true };
  }
}
