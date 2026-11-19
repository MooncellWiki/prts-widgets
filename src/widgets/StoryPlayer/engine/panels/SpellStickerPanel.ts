import { ExecutorComponent, type PanelExecutors } from "../ExecutorComponent";
import {
  exactArg,
  toBoolean,
  toOptionalNumber,
  toString,
} from "../commandParams";

import type { WaitForClick } from "../commandRegistry";
import type { ParsedCommandLine, StoryRenderer } from "../types";

interface SpellStickerPlayback {
  scheduleAutoClick: (delayMs?: number) => void;
  translateText: (text: string) => string;
  warn: (detail: string) => void;
}

type SpellStickerResult = "continue" | WaitForClick;

/**
 * Torappu.AVG.AVGSpellStickerPanel.GetExecutors (2791 @ 0x1841B28D0).
 * Playback owns the auto-click clock and the renderer plays each view's clip.
 */
export class SpellStickerPanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "clearSpellStickers" | "hideSpellSticker" | "setSpellSticker"
    >,
    private readonly playback: SpellStickerPlayback,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      spellsticker: (line, isCurrent) => this.executeSticker(line, isCurrent),
      spellstickerclear: (line, isCurrent) =>
        this.executeClear(line, isCurrent),
    };
  }

  /** OnReset / ShouldResetOnSkip (2791 @ 0x1841B2B60 / 0x1841B2C80). */
  reset(): Promise<void> | void {
    return this.renderer.clearSpellStickers();
  }

  // _OnClicked / ForceCommandEnd (2791 @ 0x1841B43F0 / 0x1841B27A0).
  // Both paths consume this wait's sticker before touching the view.
  private waitForClick(id?: string, durationMs?: number | void): WaitForClick {
    this.playback.scheduleAutoClick(
      typeof durationMs === "number" && durationMs > 0 ? durationMs : undefined,
    );
    let pendingId = id;
    const hide = () => {
      const stickerId = pendingId;
      pendingId = undefined;
      if (stickerId !== undefined) this.renderer.hideSpellSticker(stickerId);
    };
    return {
      forceEnd: hide,
      handleClick: (finishCommand) => finishCommand({ onClick: hide }),
    };
  }

  private executeSticker(
    line: ParsedCommandLine,
    isCurrent = () => true,
  ): SpellStickerResult | Promise<SpellStickerResult> {
    // _ExecuteSpellSticker (2791 @ 0x1841B37F0) displays or hides inline.
    const { args } = line;
    const id = toString(exactArg(args, "id"));
    if (!id) {
      this.playback.warn("spellsticker id is empty");
      return "continue";
    }
    const hide =
      toString(exactArg(args, "action"), "show").toLowerCase() === "hide";
    const block = toBoolean(exactArg(args, "block"));
    // _ShowSticker writes alpha when supplied and otherwise reuses it.
    const alpha = toOptionalNumber(exactArg(args, "alpha"));
    const render = hide
      ? this.renderer.hideSpellSticker(id)
      : this.renderer.setSpellSticker({
          alpha:
            alpha === undefined ? undefined : Math.min(1, Math.max(0, alpha)),
          angle: toOptionalNumber(exactArg(args, "angle")),
          content: this.playback.translateText(line.content),
          id,
          style: toString(exactArg(args, "style"), "sami"),
          x: toOptionalNumber(exactArg(args, "x")),
          xScale: toOptionalNumber(exactArg(args, "xScale")),
          y: toOptionalNumber(exactArg(args, "y")),
          yScale: toOptionalNumber(exactArg(args, "yScale")),
        });
    const complete = (durationMs: number | void): SpellStickerResult => {
      if (!block || !isCurrent()) return "continue";
      return this.waitForClick(hide ? undefined : id, durationMs);
    };
    return render instanceof Promise ? render.then(complete) : complete(render);
  }

  private executeClear(
    line: ParsedCommandLine,
    isCurrent = () => true,
  ): SpellStickerResult | Promise<SpellStickerResult> {
    // _ExecuteSpellStickerClear (2791 @ 0x1841B35D0) clears inline and
    // raises an auto click with length zero when the command blocks.
    const block = toBoolean(exactArg(line.args, "block"));
    const render = this.reset();
    const complete = (): SpellStickerResult => {
      if (!block || !isCurrent()) return "continue";
      return this.waitForClick();
    };
    return render instanceof Promise ? render.then(complete) : complete();
  }
}
