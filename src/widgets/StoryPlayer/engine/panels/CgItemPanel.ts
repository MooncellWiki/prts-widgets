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
  animateRatio: () => number;
  resolveImageKey: (key: string) => string | null;
  waitForAnimation: (
    animation: Promise<void>,
    interrupt: () => void,
  ) => Promise<boolean>;
  warn: (type: RuntimeWarning["type"], detail: string) => void;
}

/** Native _GenSlotParam (2791 @ 0x18418A440) uses the raw image and id. */
function slotKey(image: string, id: string): string {
  return id ? `${image}_${id}` : image;
}

/** AVGShowItemCgSlot._GenPosByRaw uses two components with the original signs. */
function parseCgVector2(value: unknown): CgItemInput["positionFrom"] {
  const raw = toString(value);
  if (!raw) return undefined;
  const parts = raw.split(",");
  if (parts.length !== 2) return { x: 0, y: 0 };
  return {
    x: toNumber(parts[0]),
    y: toNumber(parts[1]),
  };
}

/** AVGShowItemCgSlot._GenColorByRaw uses white for the wrong component count. */
function parseCgColor(value: unknown): CgItemInput["colorFrom"] {
  const raw = toString(value);
  if (!raw) return undefined;
  const parts = raw.split(",");
  if (parts.length !== 4) return { a: 1, b: 1, g: 1, r: 1 };
  const [r, g, b, a] = parts;
  return { a: toNumber(a), b: toNumber(b), g: toNumber(g), r: toNumber(r) };
}

/**
 * Native port: Torappu.AVG.AVGCgItemPanel (2791 GetExecutors @ 0x184188F00).
 * SkipStory force-ends blocking executors. This panel's ForceCommandEnd
 * (2791 @ 0x184188EA0) stops root shakes and leaves the slots and fades alive.
 */
export class CgItemPanel {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "clearCgItems" | "shakeCgItem" | "showCgItem" | "stopCgItemShakes"
    >,
    private readonly playback: CgItemPlayback,
  ) {}

  register(registry: CommandRegistry<CommandResult>): void {
    registry.register("cgitem", (line) => this.executeShowCgItem(line));
    registry.register("cgitemshake", (line) => this.executeShakeCgItem(line));
    registry.register("hidecgitem", (line) => this.executeHideCgItem(line));
  }

  private async executeShowCgItem({
    args,
  }: ParsedCommandLine): Promise<CommandResult> {
    // _ShowItem (2791 @ 0x18418ABF0) skips the asset load for the blocker
    // prefab and finishes its command as soon as the slot is shown.
    const style = toString(exactArg(args, "style"), "cg");
    if (style !== "cg" && style !== "blocker") {
      this.playback.warn(
        "invalid_parameter",
        `cgitem style is not registered: ${style}`,
      );
      return "continue";
    }

    const image = toString(exactArg(args, "image"));
    // Normalization belongs to Web asset lookup. Slot identity uses the
    // untouched script values for hidecgitem and focusout.
    const assetKey =
      style === "blocker" ? undefined : this.playback.resolveImageKey(image);
    if (assetKey === null) {
      this.playback.warn("missing_asset", `cgitem: ${image || "(empty)"}`);
      return "continue";
    }

    const key = slotKey(image, toString(exactArg(args, "id")));
    const durationMs = (name: string) =>
      Math.max(0, toNumber(exactArg(args, name), 0) * 1000);
    const colorFrom = parseCgColor(exactArg(args, "cfrom"));
    const colorTo = parseCgColor(exactArg(args, "cto"));
    const block = style === "cg" && toBoolean(exactArg(args, "block"));
    const animation = this.renderer.showCgItem({
      alphaDelayMs: durationMs("adelay"),
      alphaDurationMs: durationMs("aduration"),
      alphaFrom: toNumber(exactArg(args, "afrom"), 1),
      alphaTo: toNumber(exactArg(args, "ato"), 1),
      assetKey,
      block,
      colorFrom: colorFrom && colorTo ? colorFrom : undefined,
      colorTo: colorFrom && colorTo ? colorTo : undefined,
      // AVGShowItemCgSlot.Show (2791 @ 0x184242CE0) defaults to Ease.Linear (1).
      ease: toString(exactArg(args, "ease"), "Linear"),
      height: tryConvertToInt32(exactArg(args, "height")) ?? 0,
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
      width: tryConvertToInt32(exactArg(args, "width")) ?? 0,
    });
    await this.waitForAnimation(animation, block);
    return "continue";
  }

  private async executeShakeCgItem({
    args,
  }: ParsedCommandLine): Promise<CommandResult> {
    const key = slotKey(
      toString(exactArg(args, "image")),
      toString(exactArg(args, "id")),
    );
    if (toBoolean(exactArg(args, "stop"))) {
      this.renderer.stopCgItemShakes(key || undefined);
      return "continue";
    }
    if (!key) {
      this.playback.warn(
        "invalid_parameter",
        "cgitemshake requires image and an optional id",
      );
      return "continue";
    }
    // _ExecuteCgItemShake (2791 @ 0x1841898D0) scales the duration.
    // A negative result gives a 10-second path with infinite restart loops.
    const scaledDuration =
      toNumber(exactArg(args, "duration"), -1) * this.playback.animateRatio();
    const durationMs =
      Math.abs(scaledDuration) <= 0.00001 ? 0 : scaledDuration * 1000;
    const block = durationMs !== 0 && toBoolean(exactArg(args, "block"));
    const animation = this.renderer.shakeCgItem({
      block,
      durationMs: durationMs < 0 ? 10_000 : durationMs,
      fadeOut: toBoolean(exactArg(args, "fadeout")),
      infinite: durationMs < 0,
      key,
      randomness: toNumber(exactArg(args, "randomness"), 90),
      vibrato: tryConvertToInt32(exactArg(args, "vibrato")) ?? 10,
      xStrength: toNumber(exactArg(args, "xstrength"), 1),
      yStrength: toNumber(exactArg(args, "ystrength"), 0),
    });
    await this.waitForAnimation(animation, block);
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
    const block = toBoolean(exactArg(args, "block"));
    const animation = this.renderer.clearCgItems(
      key || undefined,
      Math.max(0, Math.round(fadeSeconds * 1000)),
      toString(exactArg(args, "ease"), "Linear"),
      block,
    );
    await this.waitForAnimation(animation, Boolean(key) && block);
    return "continue";
  }

  private async waitForAnimation(
    animation: Promise<void> | void,
    blocking: boolean,
  ): Promise<void> {
    if (animation && blocking) {
      await this.playback.waitForAnimation(animation, () =>
        this.renderer.stopCgItemShakes(),
      );
    } else {
      await animation;
    }
  }
}
