import { resolveAvgDisplaySlot, resolveAvgDisplayStyle } from "../avgDisplay";
import {
  exactArg,
  parseVector2,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
} from "../commandParams";

import type { CommandRegistry, CommandResult } from "../commandRegistry";
import type { ParsedCommandLine, StoryRenderer } from "../types";

interface DisplayablePlayback {
  calculateFadeMs: (seconds: unknown, fallback: number) => number;
  translateText: (text: string) => string;
  warnInvalidParameter: (detail: string) => void;
}

/** Native port: Torappu.AVG.AVGDisplayableExecutor (2791 GetExecutors @ 0x184175CA0). */
export class DisplayableExecutor {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "clearAnimTexts" | "clearAvgDisplays" | "setAnimText" | "setAvgDisplay"
    >,
    private readonly playback: DisplayablePlayback,
  ) {}

  register(registry: CommandRegistry<CommandResult>): void {
    registry.register("animtext", (line) => this.executeAnimText(line));
    registry.register("avgdisplay", (line) => this.executeAvgDisplay(line));
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
  ): Promise<CommandResult> {
    // _ExecuteAnimatedText (2791 @ 0x184176860).
    const { args, trailingText } = line;
    const rawPosition = exactArg(args, "pos");
    const parsedPosition = parseVector2(rawPosition);
    if (rawPosition !== undefined && !parsedPosition)
      this.playback.warnInvalidParameter(
        `animtext pos parse failed: ${toString(rawPosition)}`,
      );

    // Web awaits view preparation, then the view awaits the clip if blocking.
    await this.renderer.setAnimText({
      block: toBoolean(exactArg(args, "block"), false),
      content: this.playback.translateText(trailingText),
      id: toString(exactArg(args, "id")),
      name: toString(exactArg(args, "name")),
      position: parsedPosition ?? { x: 0, y: 0 },
      style: toString(exactArg(args, "style")),
    });
    return "continue";
  }

  private async executeAvgDisplay(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
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

    // The view loads the holder's content and decides whether a tween ran.
    await this.renderer.setAvgDisplay({
      alphaFrom: optional("afrom"),
      alphaTo: optional("ato"),
      block: durationMs > 0 && toBoolean(exactArg(args, "block"), false),
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
    });
    return "continue";
  }
}
