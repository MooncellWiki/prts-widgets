import {
  exactArg,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
  tryConvertToInt32,
} from "../commandParams";

import type { CommandRegistry, CommandResult } from "../commandRegistry";
import type {
  CgItemInput,
  ParsedCommandLine,
  RuntimeWarning,
  StoryRenderer,
} from "../types";

interface CgItemPlayback {
  resolveImageKey: (key: string) => string | null;
  waitForAnimation: (animation: Promise<void>) => Promise<boolean>;
  warn: (type: RuntimeWarning["type"], detail: string) => void;
}

/** Native _GenSlotParam (2791 @ 0x18418A440) uses the raw image and id. */
function slotKey(image: string, id: string): string {
  return id ? `${image}_${id}` : image;
}

/** AVGShowItemCgSlot._GenPosByRaw uses two components with the original signs. */
function parseCgVector2(value: unknown): CgItemInput["positionFrom"] {
  if (typeof value !== "string") return undefined;
  const parts = value.split(",");
  if (parts.length !== 2) return undefined;
  const x = Number.parseFloat(parts[0]!.trim());
  const y = Number.parseFloat(parts[1]!.trim());
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

/** AVGShowItemCgSlot._GenColorByRaw reads RGBA, defaulting each channel to 1. */
function parseCgColor(value: unknown): CgItemInput["colorFrom"] {
  if (typeof value !== "string") return undefined;
  const parts = value.split(",");
  if (parts.length !== 4) return undefined;
  const values = parts.map((part) => {
    const parsed = Number.parseFloat(part.trim());
    return Number.isFinite(parsed) ? parsed : 1;
  });
  return { a: values[3]!, b: values[2]!, g: values[1]!, r: values[0]! };
}

/**
 * Native port: Torappu.AVG.AVGCgItemPanel (2791 GetExecutors @ 0x184188F00).
 * StoryRenderer owns the slots and PostDisplay registration. SkipStory
 * (2791 @ 0x18416E560) releases the command wait while the slot keeps animating.
 */
export class CgItemPanel {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "clearCgItems" | "showCgItem"
    >,
    private readonly playback: CgItemPlayback,
  ) {}

  register(registry: CommandRegistry<CommandResult>): void {
    registry.register("cgitem", (line) => this.executeShowCgItem(line));
    registry.register("hidecgitem", (line) => this.executeHideCgItem(line));
  }

  private async executeShowCgItem({
    args,
  }: ParsedCommandLine): Promise<CommandResult> {
    // _ExecuteShowCgItem (2791 @ 0x18418A1F0) passes the command's block flag
    // and _ShowItem chooses the prefab. The blocker prefab shows without a
    // sprite and finishes immediately. The Web adapter omits that prefab.
    const style = toString(exactArg(args, "style"), "cg");
    if (style === "blocker") {
      this.playback.warn(
        "unsupported_command",
        "cgitem style=blocker uses a native-only scene sprite",
      );
      return "continue";
    }
    if (style !== "cg") {
      this.playback.warn(
        "invalid_parameter",
        `cgitem style is not registered: ${style}`,
      );
      return "continue";
    }

    const image = toString(exactArg(args, "image"));
    if (!image) {
      this.playback.warn("missing_asset", "cgitem: (empty)");
      return "continue";
    }
    // Normalization belongs to Web asset lookup. Slot identity uses the
    // untouched script values for hidecgitem and focusout.
    const assetKey = this.playback.resolveImageKey(image);
    if (!assetKey) {
      this.playback.warn("missing_asset", `cgitem: ${image}`);
      return "continue";
    }

    const key = slotKey(image, toString(exactArg(args, "id")));
    const durationMs = (name: string) =>
      Math.max(0, toNumber(exactArg(args, name), 0) * 1000);
    const colorFrom = parseCgColor(exactArg(args, "cfrom"));
    const colorTo = parseCgColor(exactArg(args, "cto"));
    const animation = this.renderer.showCgItem({
      alphaDelayMs: durationMs("adelay"),
      alphaDurationMs: durationMs("aduration"),
      alphaFrom: toNumber(exactArg(args, "afrom"), 1),
      alphaTo: toNumber(exactArg(args, "ato"), 1),
      assetKey,
      block: toBoolean(exactArg(args, "block"), false),
      colorFrom: colorFrom && colorTo ? colorFrom : undefined,
      colorTo: colorFrom && colorTo ? colorTo : undefined,
      // AVGShowItemCgSlot.Show (2791 @ 0x184242CE0) defaults to Ease.Linear (1).
      ease: toString(exactArg(args, "ease"), "Linear"),
      height: Math.trunc(toNumber(exactArg(args, "height"), 0)),
      key,
      // AVGShowItemCgSlot.Show reads layer with GetInt(defaultValue: 0).
      layer: tryConvertToInt32(exactArg(args, "layer")) ?? 0,
      positionDelayMs: durationMs("pdelay"),
      positionDurationMs: durationMs("pduration"),
      positionFrom: parseCgVector2(exactArg(args, "pfrom")),
      positionTo: parseCgVector2(exactArg(args, "pto")),
      rotationDurationMs: durationMs("rduration"),
      rotationFrom: toNumber(exactArg(args, "rfrom"), -1),
      rotationTo: toNumber(exactArg(args, "rto"), 0),
      scaleDelayMs: durationMs("sdelay"),
      scaleDurationMs: durationMs("sduration"),
      scaleFrom: toNumber(exactArg(args, "sfrom"), 1),
      scaleTo: toNumber(exactArg(args, "sto"), 1),
      width: Math.trunc(toNumber(exactArg(args, "width"), 0)),
    });
    await this.playback.waitForAnimation(animation);
    return "continue";
  }

  private async executeHideCgItem({
    args,
  }: ParsedCommandLine): Promise<CommandResult> {
    // _ExecuteHideCgItem (2791 @ 0x184189F20) selects one slot for a
    // nonempty key. _ClearAllItems finishes after starting every fade.
    const key = slotKey(
      toString(exactArg(args, "image")),
      toString(exactArg(args, "id")),
    );
    // AVGShowItemCgSlot.Hide (2791 @ 0x184242970) lets duration override
    // fadetime. Web keeps fadetime when duration cannot be converted.
    const fadeSeconds =
      toOptionalNumber(exactArg(args, "duration")) ??
      toNumber(exactArg(args, "fadetime"), 0.13);
    const animation = this.renderer.clearCgItems(
      key || undefined,
      Math.max(0, Math.round(fadeSeconds * 1000)),
      toString(exactArg(args, "ease"), "Linear"),
      toBoolean(exactArg(args, "block"), false),
    );
    if (animation) await this.playback.waitForAnimation(animation);
    return "continue";
  }
}
