import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import {
  exactArg,
  toNumber,
  toOptionalNumber,
  toString,
  tryConvertToInt32,
} from "../commandParams";

import type {
  CgItemInput,
  ParsedCommandLine,
  RuntimeWarning,
  StoryCommandArgs,
  StoryRenderer,
} from "../types";

interface CgItemPlayback {
  animateRatio: () => number;
  resolveImageKey: (key: string) => string | null;
  warn: (type: RuntimeWarning["type"], detail: string) => void;
}

/** GetBool (2791 @ 0x186940F30) uses Convert.ToBoolean for boxed values. */
function getBool(args: StoryCommandArgs, key: string): boolean {
  const value = exactArg(args, key);
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string")
    return /^[\p{White_Space}\0]*true[\p{White_Space}\0]*$/iu.test(value);
  return value === true;
}

/** GetFloat and Command.TryGetParam convert an explicit null to zero. */
function getFloat(args: StoryCommandArgs, key: string): number | undefined {
  const value = exactArg(args, key);
  return value === null ? 0 : toOptionalNumber(value);
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
export class CgItemPanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "clearCgItems" | "shakeCgItem" | "showCgItem" | "stopCgItemShakes"
    >,
    private readonly playback: CgItemPlayback,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      cgitem: (line) => this.executeShowCgItem(line),
      cgitemshake: (line) => this.executeShakeCgItem(line),
      hidecgitem: (line) => this.executeHideCgItem(line),
    };
  }

  protected override forceCommandEnd(): void {
    this.renderer.stopCgItemShakes();
  }

  private executeShowCgItem({ args }: ParsedCommandLine): ExecutorResult {
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
    const secondsToMs = (name: string) => (getFloat(args, name) ?? 0) * 1000;
    const durationMs = (name: string) => Math.max(0, secondsToMs(name));
    const colorFrom = parseCgColor(exactArg(args, "cfrom"));
    const colorTo = parseCgColor(exactArg(args, "cto"));
    const block = style === "cg" && getBool(args, "block");
    const input: CgItemInput = {
      alphaDelayMs: secondsToMs("adelay"),
      alphaDurationMs: durationMs("aduration"),
      alphaFrom: getFloat(args, "afrom") ?? 1,
      alphaTo: getFloat(args, "ato") ?? 1,
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
      positionDelayMs: secondsToMs("pdelay"),
      positionDurationMs: durationMs("pduration"),
      positionFrom: parseCgVector2(exactArg(args, "pfrom")),
      positionTo: parseCgVector2(exactArg(args, "pto")),
      rotationDurationMs: durationMs("rduration"),
      rotationFrom: getFloat(args, "rfrom") ?? -1,
      rotationTo: getFloat(args, "rto") ?? 0,
      scaleDelayMs: secondsToMs("sdelay"),
      scaleDurationMs: durationMs("sduration"),
      scaleFrom: getFloat(args, "sfrom") ?? 1,
      scaleTo: getFloat(args, "sto") ?? 1,
      width: tryConvertToInt32(exactArg(args, "width")) ?? 0,
    };
    return {
      animation: this.renderer.showCgItem(
        input,
        style === "cg" ? this.finishCommand : undefined,
      ),
      block,
    };
  }

  private executeShakeCgItem({ args }: ParsedCommandLine): ExecutorResult {
    const key = slotKey(
      toString(exactArg(args, "image")),
      toString(exactArg(args, "id")),
    );
    if (getBool(args, "stop")) {
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
      (getFloat(args, "duration") ?? -1) * this.playback.animateRatio();
    const durationMs =
      Math.abs(scaledDuration) <= 0.00001 ? 0 : scaledDuration * 1000;
    const block = durationMs !== 0 && getBool(args, "block");
    // A nonblocking shake only resets its transform at OnComplete.
    return {
      animation: this.renderer.shakeCgItem(
        {
          block,
          durationMs: durationMs < 0 ? 10_000 : durationMs,
          fadeOut: getBool(args, "fadeout"),
          infinite: durationMs < 0,
          key,
          randomness: getFloat(args, "randomness") ?? 90,
          vibrato: tryConvertToInt32(exactArg(args, "vibrato")) ?? 10,
          xStrength: getFloat(args, "xstrength") ?? 1,
          yStrength: getFloat(args, "ystrength") ?? 0,
        },
        block ? this.finishCommand : undefined,
      ),
      block,
    };
  }

  private executeHideCgItem({ args }: ParsedCommandLine): ExecutorResult {
    // _ExecuteHideCgItem (2791 @ 0x184189F20) selects one slot for a
    // nonempty key. _ClearAllItems finishes after starting every fade.
    const key = slotKey(
      toString(exactArg(args, "image")),
      toString(exactArg(args, "id")),
    );
    // AVGShowItemCgSlot.Hide (2791 @ 0x184242970) lets duration override
    // fadetime. Web keeps fadetime when duration cannot be converted.
    const fadeSeconds =
      getFloat(args, "duration") ?? getFloat(args, "fadetime") ?? 0.13;
    const block = getBool(args, "block");
    const animation = this.renderer.clearCgItems(
      key || undefined,
      Math.max(0, Math.round(fadeSeconds * 1000)),
      toString(exactArg(args, "ease"), "Linear"),
      block,
      key ? this.finishCommand : undefined,
    );
    return {
      animation,
      block: Boolean(key) && block,
    };
  }
}
