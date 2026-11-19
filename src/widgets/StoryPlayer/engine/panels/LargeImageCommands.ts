import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import { toBoolean, toNumber } from "../commandParams";
import { LOOP_BLOCK_WARNING } from "../imageParams";
import {
  legacyPuzzleArg,
  parsePuzzleDimensions,
  parsePuzzleTween,
  resolvePuzzleAssets,
} from "../puzzleCommands";

import type {
  ParsedCommandLine,
  RuntimeWarning,
  StoryRenderer,
} from "../types";

/** Legacy Web foreground puzzle commands. */
export class LargeImageCommands extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      | "cancelLargeImagePreparation"
      | "clearLargeImage"
      | "setLargeImage"
      | "setLargeImageTween"
    >,
    private readonly warn: (
      type: RuntimeWarning["type"],
      detail: string,
    ) => void,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      largeimg: (line) => this.show(line),
      largeimgtween: (line) => this.move(line),
    };
  }

  protected override forceCommandEnd(): void {
    this.renderer.cancelLargeImagePreparation();
  }

  private show({ args }: ParsedCommandLine): ExecutorResult {
    const read = (key: string) => legacyPuzzleArg(args, key);
    const assets = resolvePuzzleAssets(args, true);
    const fadeMs = Math.max(
      0,
      Math.round(toNumber(read("fadetime"), assets ? 0.15 : 0) * 1000),
    );
    const block = toBoolean(
      read("blok"),
      toBoolean(read("isblock"), toBoolean(read("block"))),
    );
    if (!assets) {
      return { animation: this.renderer.clearLargeImage(fadeMs, block), block };
    }

    const solidWidths = parsePuzzleDimensions(read("solidwidth"));
    const solidHeights = parsePuzzleDimensions(read("solidheight"));
    const count = assets.imageKeys.length;
    if (count === 0) {
      this.warn("parse", "largeimg imagegroup is empty");
      return "continue";
    }
    if (solidWidths.length * solidHeights.length !== count) {
      this.warn(
        "parse",
        `largeimg expects width_count * height_count === image_count, got ${solidWidths.length} * ${solidHeights.length} !== ${count}`,
      );
      return "continue";
    }

    const animation = this.renderer.setLargeImage({
      ...assets,
      block,
      fadeMs,
      layout: "large",
      scaleX: Math.max(0, toNumber(read("xscale"), 1)),
      scaleY: Math.max(0, toNumber(read("yscale"), 1)),
      solidHeights,
      solidWidths,
      x: toNumber(read("x")),
      y: toNumber(read("y")),
    });
    return { animation, block: animation?.blocking ?? false };
  }

  private move({ args }: ParsedCommandLine): ExecutorResult {
    const input = parsePuzzleTween(args, true);
    if (input.block && input.loop)
      this.warn("invalid_parameter", LOOP_BLOCK_WARNING);
    const block = input.block && !input.loop;
    return {
      animation: this.renderer.setLargeImageTween({ ...input, block }),
      block,
    };
  }
}
