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
  toOptionalNumber,
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
    private readonly calculateFadeMs: (
      seconds: unknown,
      fallback: number,
    ) => number,
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
    const direction = Math.trunc(toNumber(exactArg(args, "direction"), -1));
    const scaledMs = this.calculateFadeMs(exactArg(args, "fadetime"), 0.4);
    const fadeMs = hasTweenDuration(scaledMs / 1000) ? scaledMs : 0;
    if (direction < 0) {
      // _HideAllCurtains (0x1841AAF20) starts retractions without blocking.
      this.renderer.clearCurtains(fadeMs);
      return;
    }
    if (direction > 7) {
      this.warnInvalidParameter(`curtain direction:${direction}`);
      return;
    }

    const alpha = toNumber(exactArg(args, "a"), -1);
    const block = fadeMs > 0 && toBoolean(exactArg(args, "block"));
    const animation = this.renderer.setCurtain(
      {
        alphaFrom: toOptionalNumber(exactArg(args, "afrom")),
        alphaTo: alpha >= 0 ? alpha : undefined,
        block,
        delayMs: Math.max(0, toNumber(exactArg(args, "delay")) * 1000),
        direction,
        fadeMs,
        fillFrom: toNumber(exactArg(args, "fillfrom"), 1),
        fillTo: toNumber(exactArg(args, "fillto")),
        grad: toBoolean(exactArg(args, "grad")),
      },
      block ? this.finishSequence : undefined,
    );
    return block ? animation : undefined;
  }
}
