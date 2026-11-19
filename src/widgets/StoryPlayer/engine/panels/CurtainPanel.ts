import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import {
  exactArg,
  getBool,
  getFiniteFloat,
  isNonNegativeFloat,
  tryConvertToInt32,
} from "../commandParams";

import type { ExecutionHandle } from "../execution";
import type { ParsedCommandLine, StoryRenderer } from "../types";

/** Torappu.AVG.AVGCurtainPanel (2791 GetExecutors @ 0x1841AA1A0). */
export class CurtainPanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "clearCurtains" | "recycleCurtains" | "resetCurtains" | "setCurtain"
    >,
    private readonly calculateFadeMs: (seconds: number) => number,
    private readonly warnInvalidParameter: (detail: string) => void,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      curtain: (line): ExecutorResult => {
        const animation = this.show(line);
        if (animation) return { animation, block: true };
        this.renderer.recycleCurtains();
        return "continue";
      },
    };
  }

  /** OnReset (2791 @ 0x1841AA4A0). ShouldResetOnSkip (0x1841AA510) is false. */
  reset(): void {
    this.renderer.resetCurtains();
  }

  /** OnFinish (2791 @ 0x1841AA360) recycles even if a skip released the wait. */
  private readonly finishSequence = (): void => {
    this.renderer.recycleCurtains();
    this.finishCommand();
  };

  /** _ExecuteCurtain (2791 @ 0x1841AA580). The interval uses literal seconds. */
  private show({ args }: ParsedCommandLine): ExecutionHandle | void {
    // GetInt (2791 @ 0x186941320) uses Convert.ToInt32 on boxed values.
    const rawDirection = exactArg(args, "direction");
    const direction =
      rawDirection === undefined ? -1 : tryConvertToInt32(rawDirection);
    if (direction === null || direction > 7) {
      this.warnInvalidParameter(
        `curtain direction:${direction ?? rawDirection}`,
      );
      return;
    }

    const fadeMs = this.calculateFadeMs(
      getFiniteFloat(args, "fadetime") ?? 0.4,
    );
    if (direction < 0) {
      // _HideAllCurtains (0x1841AAF20) starts retractions without blocking.
      this.renderer.clearCurtains(fadeMs);
      return;
    }

    const alpha = getFiniteFloat(args, "a") ?? -1;
    const block = fadeMs !== 0 && getBool(args, "block");
    const animation = this.renderer.setCurtain(
      {
        alphaFrom: getFiniteFloat(args, "afrom"),
        alphaTo: isNonNegativeFloat(alpha) ? alpha : undefined,
        block,
        delayMs: (getFiniteFloat(args, "delay") ?? 0) * 1000,
        direction,
        fadeMs,
        fillFrom: getFiniteFloat(args, "fillfrom") ?? 1,
        fillTo: getFiniteFloat(args, "fillto") ?? 0,
        grad: getBool(args, "grad"),
      },
      block ? this.finishSequence : undefined,
    );
    return block ? animation : undefined;
  }
}
