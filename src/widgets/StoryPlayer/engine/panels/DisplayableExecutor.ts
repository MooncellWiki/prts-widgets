import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import { resolveAvgDisplaySlot, resolveAvgDisplayStyle } from "../avgDisplay";
import {
  exactArg,
  parseVector2,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
} from "../commandParams";

import type { ParsedCommandLine, StoryRenderer } from "../types";

interface DisplayablePlayback {
  calculateFadeMs: (seconds: unknown, fallback: number) => number;
  translateText: (text: string) => string;
  warnInvalidParameter: (detail: string) => void;
}

/**
 * Torappu.AVG.AVGDisplayableExecutor (2791 GetExecutors @ 0x184175CA0).
 * ForceCommandEnd (0x184175C40) leaves the stamp and holder animations running.
 */
export class DisplayableExecutor extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "clearAnimTexts" | "clearAvgDisplays" | "setAnimText" | "setAvgDisplay"
    >,
    private readonly playback: DisplayablePlayback,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      animtext: (line) => this.executeAnimText(line),
      avgdisplay: (line) => this.executeAvgDisplay(line),
    };
  }

  /**
   * OnReset (2791 @ 0x184175E30) clears the stamps before the manager.
   * ShouldResetOnSkip (0x184175EB0) keeps both alive across segment jumps.
   */
  reset(): void {
    void this.renderer.clearAnimTexts();
    void this.renderer.clearAvgDisplays();
  }

  private async executeAnimText(
    line: ParsedCommandLine,
  ): Promise<ExecutorResult> {
    // _ExecuteAnimatedText (2791 @ 0x184176860).
    const { args, trailingText } = line;
    const rawPosition = exactArg(args, "pos");
    const parsedPosition = parseVector2(rawPosition);
    if (rawPosition !== undefined && !parsedPosition)
      this.playback.warnInvalidParameter(
        `animtext pos parse failed: ${toString(rawPosition)}`,
      );

    // Native attaches FinishCommand to InitView for a blocking stamp. The
    // Web first awaits its assets, then ExecutorComponent handles the wait.
    const block = toBoolean(exactArg(args, "block"));
    const input = {
      content: this.playback.translateText(trailingText),
      id: toString(exactArg(args, "id")),
      name: toString(exactArg(args, "name")),
      position: parsedPosition ?? { x: 0, y: 0 },
      style: toString(exactArg(args, "style")),
    };
    const { animation } = await this.renderer.setAnimText(
      input,
      block ? this.finishCommand : undefined,
    );
    return { animation, block };
  }

  private async executeAvgDisplay(
    line: ParsedCommandLine,
  ): Promise<ExecutorResult> {
    // _ExecuteAVGDisplayable (2791 @ 0x184176290).
    const { args } = line;
    const optional = (key: string) => toOptionalNumber(exactArg(args, key));
    const style = resolveAvgDisplayStyle(toString(exactArg(args, "style")));
    const slot = resolveAvgDisplaySlot(toString(exactArg(args, "slot")));
    // The Web view uses one scaled duration with the default for its style.
    const durationMs = this.playback.calculateFadeMs(
      exactArg(args, "duration"),
      style === "bg" ? 0.1 : 0,
    );

    // Native only waits when the holder returned a tween and block was set.
    const block = durationMs > 0 && toBoolean(exactArg(args, "block"));
    const input = {
      alphaFrom: optional("afrom"),
      alphaTo: optional("ato"),
      durationMs,
      entryFrom: optional("entryfrom"),
      entryIndex: Math.trunc(toNumber(exactArg(args, "entryindex"), 0)),
      entryTo: optional("entryto"),
      id: toString(exactArg(args, "id")),
      layer: Math.trunc(toNumber(exactArg(args, "layer"), 1)),
      name: toString(exactArg(args, "name")),
      rotationX: toNumber(exactArg(args, "rox"), 0),
      rotationY: toNumber(exactArg(args, "roy"), 0),
      rotationZ: toNumber(exactArg(args, "roz"), 0),
      scaleX: optional("scalex"),
      scaleXFrom: optional("scalexfrom"),
      scaleXTo: optional("scalexto"),
      scaleY: optional("scaley"),
      scaleYFrom: optional("scaleyfrom"),
      scaleYTo: optional("scaleyto"),
      slot,
      style,
      x: optional("x"),
      xFrom: optional("xfrom"),
      xTo: optional("xto"),
      y: optional("y"),
      yFrom: optional("yfrom"),
      yTo: optional("yto"),
    };
    const { animation } = await this.renderer.setAvgDisplay(
      input,
      block ? this.finishCommand : undefined,
    );
    return { animation, block };
  }
}
