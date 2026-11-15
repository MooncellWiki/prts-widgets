import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import { exactArg, toBoolean, toNumber, toString } from "../commandParams";
import {
  LOOP_BLOCK_WARNING,
  parsePuzzleDimensions,
  parsePuzzleTween,
  resolvePuzzleAssets,
} from "../puzzleCommands";

import type {
  GridBackgroundInput,
  ParsedCommandLine,
  RuntimeWarning,
  StoryRenderer,
} from "../types";

type PuzzleLayout = NonNullable<GridBackgroundInput["layout"]>;
type Warn = (
  type: RuntimeWarning["type"],
  detail: string,
  line?: ParsedCommandLine,
) => void;

/** Torappu.AVG.LargeBackgroundPanel (2791 GetExecutors @ 0x1841D7D20). */
export class LargeBackgroundPanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      | "cancelGridBackgroundPreparation"
      | "clearGridBackground"
      | "setGridBackground"
      | "setLargeBackgroundTween"
    >,
    private readonly warn: Warn,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      gridbg: (line) => this.show(line, "grid"),
      largebg: (line) => this.show(line, "large"),
      largebgtween: (line) => this.move(line),
      verticalbg: (line) => this.show(line, "vertical"),
    };
  }

  /** OnReset clears the puzzle at story end (2791 @ 0x1841D7F80). */
  reset(): void {
    this.renderer.clearGridBackground();
  }

  protected override forceCommandEnd(): void {
    // ForceCommandEnd (2791 @ 0x1841D7CB0) is empty. ShouldResetOnSkip
    // (0x1841D8170) keeps the mounted puzzle and its animation. Web can
    // still be waiting for art, so abandon that preparation on a jump.
    this.renderer.cancelGridBackgroundPreparation();
  }

  private show(line: ParsedCommandLine, layout: PuzzleLayout): ExecutorResult {
    const { args, command } = line;
    const assets = resolvePuzzleAssets(args, false);
    // _ExecuteImage / _ExecuteVerticalBG / _ExecuteGridBG forward fadetime
    // directly to DOFade. Only a positive fade can block the command.
    const fadeMs = Math.max(0, toNumber(exactArg(args, "fadetime")) * 1000);
    const block = fadeMs > 0 && toBoolean(exactArg(args, "block"));
    // The DOFade OnKill callback calls FinishCommand when block is set.
    const onComplete = block ? this.finishCommand : undefined;
    if (!assets) {
      return {
        animation: this.renderer.clearGridBackground(fadeMs, block, onComplete),
        block,
      };
    }

    const count = assets.imageKeys.length;
    const rawWidth = exactArg(args, "solidwidth");
    const rawHeight = exactArg(args, "solidheight");
    const width = toNumber(rawWidth);
    const solidWidths =
      layout === "vertical"
        ? width > 0
          ? [width]
          : []
        : parsePuzzleDimensions(rawWidth).slice(0, 2);
    const solidHeights =
      layout === "large"
        ? [toNumber(rawHeight)]
        : parsePuzzleDimensions(rawHeight).slice(
            0,
            layout === "grid" ? 2 : count,
          );
    const error = puzzleSizeError(
      command,
      layout,
      count,
      solidWidths.length,
      solidHeights.length,
    );
    if (error) {
      // Native _ResetPanel drops the whole composition after invalid input.
      this.warn("parse", error, layout === "vertical" ? line : undefined);
      this.renderer.clearGridBackground(0, false);
      return "continue";
    }
    if (layout === "vertical" && count === 1) {
      // _ExecuteVerticalBG reads height[1] for the pivot. Web can draw one tile.
      this.warn(
        "parse",
        "verticalbg with a single tile would crash the native client",
        line,
      );
    }

    const position = toString(exactArg(args, "initposmode"), "default");
    const initPositionMode =
      position === "default" ||
      position === "upperleft" ||
      position === "lowercenter"
        ? position
        : "center";
    const animation = this.renderer.setGridBackground(
      {
        ...assets,
        block,
        fadeMs,
        initPositionMode,
        layout,
        scaleX: toNumber(exactArg(args, "xScale"), 1),
        scaleY: toNumber(exactArg(args, "yScale"), 1),
        solidHeights,
        solidWidths,
        x: toNumber(exactArg(args, "x")),
        y: toNumber(exactArg(args, "y")),
      },
      onComplete,
    );
    // A cache miss also reports a blocking handle while it prepares the tiles.
    return { animation, block: animation?.blocking ?? false };
  }

  private move({ args }: ParsedCommandLine): ExecutorResult {
    const input = parsePuzzleTween(args, false);
    // Keep the native diagnostic and the Web policy of advancing on loops.
    if (input.block && input.loop)
      this.warn("invalid_parameter", LOOP_BLOCK_WARNING);
    const block = input.block && !input.loop;
    return {
      // _ExecuteImageTween hooks DOLocalMove's OnComplete even for a
      // nonblocking move. It can release the panel's next active command.
      animation: this.renderer.setLargeBackgroundTween(
        { ...input, block },
        this.finishCommand,
      ),
      block,
    };
  }
}

function puzzleSizeError(
  command: string,
  layout: PuzzleLayout,
  count: number,
  widths: number,
  heights: number,
): string | undefined {
  if (count === 0) return `${command} imagegroup is empty`;
  if (layout === "grid") {
    if (count !== 4 || widths !== 2 || heights !== 2)
      return `gridbg expects ${count} widths/heights, got ${widths}/${heights}`;
  } else if (layout === "vertical") {
    if (count > 4 || widths !== 1 || heights !== count)
      return `verticalbg expects width_count * height_count === image_count, got ${widths} * ${heights} !== ${count}`;
  } else if (count !== 2 || widths !== 2) {
    return `largebg expects width_count * height_count === image_count, got ${widths} * 1 !== ${count}`;
  }
}
