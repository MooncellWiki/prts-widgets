import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import { nativeCharacterFadeIdentity } from "../characterRef";
import {
  getFiniteFloat,
  isZeroFloat,
  toBoolean,
  toNumber,
  toString,
} from "../commandParams";

import {
  type CharacterCommandContext,
  toNativeIntParam,
  warnNativeSlotThrows,
} from "./characterCommandParams";

import type {
  CharacterSlotInput,
  ParsedCommandLine,
  StoryCommandArgs,
  StoryRenderer,
} from "../types";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Torappu.AVG.AVGCharacterslotPanel.GetExecutors (2791 @ 0x1841A0DC0). */
export class CharacterslotPanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "clearCharacters" | "setCharacterSlot"
    >,
    private readonly playback: CharacterCommandContext,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return { charslot: (line) => this.update(line) };
  }

  private update(line: ParsedCommandLine): ExecutorResult {
    const { args } = line;
    const rawSlot = toString(args.slot).trim();
    const slot = this.parseCharacterSlot(rawSlot);
    const nameRef = toString(args.name);
    // _ExecuteCharslot (2791 @ 0x1841A3070) scales duration. The Sequence
    // auto-plays, while end gates isblock for a named slot.
    const durationMs = this.playback.calculateFadeMs(args.duration, 0);
    const isEnd = toString(args.end).trim().toLowerCase() !== "false";
    const rawBlock = toBoolean(args.isblock, false);
    const block = rawBlock && isEnd;

    if (!rawSlot) {
      // The clear-all branch forwards isblock directly to _CleanSlotsWithTween
      // (2791 @ 0x1841A1CA0) after discarding the cached Sequences.
      const animation = this.renderer.clearCharacters(
        undefined,
        isZeroFloat(durationMs / 1000) ? 0 : durationMs,
        this.finishCommand,
      );
      return { animation, block: rawBlock };
    }

    if (!slot) {
      // `custom` and any other unknown slot name resolve through
      // _TryPrepareCustomSlotCommand / _GetSlotWithName, which we do not model.
      this.playback.warn(
        "unsupported_visual",
        `charslot slot is not a built-in slot: ${rawSlot}`,
        line,
      );
      return "continue";
    }

    // _UpdateSeqWithParam (2791 @ 0x1841A9600) matches char_empty ordinally.
    // CharacterView tracks the transparent holder as the slot applies focus
    // and actions.
    const isEmptyChar = nameRef === "char_empty";

    let resolved: { base: string; expression: string } | null = null;
    if (nameRef && !isEmptyChar) {
      const resolution = this.playback.resolveCharacterName(nameRef);
      if (resolution.kind === "native_throws")
        return warnNativeSlotThrows(this.playback.warn, nameRef, line);
      resolved = resolution.kind === "found" ? resolution.selection : null;
      if (!resolved)
        this.playback.warn("missing_asset", `character: ${nameRef}`);
    }
    // Native `_UpdateSeqWithParam` alpha handling:
    // - with a `name`, a negative (or omitted, default -1) afrom or ato
    //   resets the pair to (0, 1): a plain named charslot always fades
    //   the new art in over `duration`;
    // - without a `name`, only `GE(afrom, 0)` gates
    //   `SlotChangeAlpha(afrom, ato, duration)` (0x184238040), and ato is
    //   passed through as-is. An omitted ato (-1) therefore tweens the
    //   vertex colour linearly toward alpha -1, which Unity's Color32
    //   conversion clamps to 0 -- a fade-out that is fully transparent by
    //   `duration / 2` (29 corpus lines write `afrom=1` with no ato as an
    //   exit, e.g. story_whitw2_1_1.txt:475). duration 0 =>
    //   SetAlpha(fore, ato) with the same clamp. The negative target is
    //   handed through so the renderer reproduces that timing; it clamps
    //   at the write.
    const rawAlphaFrom =
      args.afrom === undefined ? -1 : toNumber(args.afrom, -1);
    const rawAlphaTo = args.ato === undefined ? -1 : toNumber(args.ato, -1);
    let alphaFrom: number | undefined;
    let alphaTo: number | undefined;
    if (resolved) {
      if (rawAlphaFrom < 0 || rawAlphaTo < 0) {
        alphaFrom = 0;
        alphaTo = 1;
      } else {
        alphaFrom = clamp01(rawAlphaFrom);
        alphaTo = clamp01(rawAlphaTo);
      }
    } else if (!nameRef && rawAlphaFrom >= 0) {
      alphaFrom = clamp01(rawAlphaFrom);
      alphaTo = Math.min(1, rawAlphaTo);
    }

    // _ExecuteCharslot's Sequence.OnComplete (2791 @ 0x1841B61F0) reads
    // this panel's shared completion slot even when the sequence starts unblocked.
    const action = this.parseCharacterSlotAction(args.action);
    const input: CharacterSlotInput = {
      action,
      ...(args.angle === undefined ? {} : { angle: toNumber(args.angle, 0) }),
      alphaFrom,
      alphaTo,
      blackEnd:
        args.bend === undefined ? undefined : toNumber(args.bend, Number.NaN),
      blackStart:
        args.bstart === undefined
          ? undefined
          : toNumber(args.bstart, Number.NaN),
      block,
      characterKey: resolved?.base,
      ...(args.circles === undefined
        ? {}
        : { circles: Math.trunc(toNumber(args.circles, 0)) }),
      // _ExecuteCharslot scales duration and focusduration only. delay is
      // the unscaled insertion point in _UpdateSeqWithTween (0x1841A9BE0).
      delayMs: (getFiniteFloat(args, "delay") ?? 0) * 1000,
      durationMs,
      expression: resolved?.expression,
      fadeIdentity: nameRef ? nativeCharacterFadeIdentity(nameRef) : undefined,
      focusDurationMs: this.playback.calculateFadeMs(
        getFiniteFloat(args, "focusduration"),
        0,
      ),
      focusMode: "subset",
      focusSlots: this.resolveCharacterSlotFocusSlots(args),
      ...(args.inverse === undefined
        ? {}
        : { inverse: toBoolean(args.inverse, false) }),
      nativeKey: nameRef || undefined,
      // _UpdateSeqWithParam (2791 @ 0x1841A9600) tries the plain posfrom
      // move only for an empty actionName. An unknown name yields no tween.
      positionFrom:
        action || !toString(args.action)
          ? this.parseCharacterSlotPoint(args.posfrom)
          : undefined,
      // `_ExecuteCharslot` treats a posto that is present but not an
      // "x,y" pair differently from posfrom/poszoom: those log a parse
      // error and keep the (1,1) default, posto falls back to
      // Vector2.zero (2791 @ 0x1841A3070). Scalar `posto=0` lines
      // in the corpus therefore mean (0,0) natively.
      positionTo:
        this.parseCharacterSlotPoint(args.posto) ??
        (toString(args.posto).trim() ? { x: 0, y: 0 } : undefined),
      posZoom: this.parseCharacterSlotPoint(args.poszoom),
      power: Math.max(0, toNumber(args.power, 0)),
      randomness: Math.min(100, Math.max(0, toNativeIntParam(args.random, 10))),
      // The crossfade length of an image swap is `duration` itself
      // (`_SlotSetCharInternal` -> `_GenForeImageTween` /
      // `_GenBackImageTween`). `fadetime` is not a charslot key at all
      // (dead parameter in both 2.7.51 and 2.7.61 audits).
      replaceFadeMs: durationMs,
      scaleX:
        args.xscale === undefined && args.scale === undefined
          ? undefined
          : Math.max(0, toNumber(args.xscale, toNumber(args.scale, 1))),
      scaleY:
        args.yscale === undefined && args.scale === undefined
          ? undefined
          : Math.max(0, toNumber(args.yscale, toNumber(args.scale, 1))),
      slot,
      stop: toBoolean(args.stop, false),
      // GetOrDefault<int>("times", 0): DOShakePosition vibrato for
      // shake, numJumps (clamped to >= 1 by DOLocalJump) for jump.
      times: toNativeIntParam(args.times, 0),
    };
    const animation = this.renderer.setCharacterSlot(
      input,
      isEnd ? this.finishCommand : undefined,
    );
    return { animation, block: true };
  }

  private parseCharacterSlot(value: unknown): string | undefined {
    switch (toString(value).trim().toLowerCase()) {
      case "char_left":
      case "l":
      case "left": {
        return "l";
      }
      case "c":
      case "center":
      case "char_middle":
      case "m":
      case "middle": {
        return "m";
      }
      case "char_right":
      case "r":
      case "right": {
        return "r";
      }
      default: {
        return undefined;
      }
    }
  }

  private parseCharacterSlotAction(
    value: unknown,
  ): CharacterSlotInput["action"] | undefined {
    const normalized = toString(value).trim().toLowerCase();
    if (
      [
        "jump",
        "move",
        "rotate",
        "setpos",
        "shake",
        "shakemove",
        "zoom",
      ].includes(normalized)
    )
      return normalized as CharacterSlotInput["action"];
    return undefined;
  }

  private parseCharacterSlotPoint(
    value: unknown,
  ): { x: number; y: number } | undefined {
    const raw = toString(value).trim();
    if (!raw) return undefined;

    const [xRaw, yRaw] = raw.split(",").map((part) => part.trim());
    if (!xRaw || !yRaw) return undefined;
    if (!/^-?\d+(?:\.\d+)?$/.test(xRaw) || !/^-?\d+(?:\.\d+)?$/.test(yRaw))
      return undefined;

    return {
      x: Number(xRaw),
      y: Number(yRaw),
    };
  }

  private resolveCharacterSlotFocusSlots(args: StoryCommandArgs): string[] {
    // Native `_ExecuteCharslot` turns an omitted `focus` into ["all"], and
    // `_ProcessFocusArray` (2791 @ 0x1841A6A00) recognizes only
    // all / left|l / middle|m / right|r / custom|c. There is no "n"/"none"/"a"
    // branch: an unrecognized value clears all four focus flags and lights
    // nothing, i.e. every slot goes dim. Custom slots are not modeled, so
    // "all" maps to the three built-ins.
    const focus = toString(args.focus).trim().toLowerCase();
    if (!focus || focus === "all") return ["l", "m", "r"];

    // The focus tokens are their own vocabulary, not the `slot` vocabulary:
    // `_ProcessFocusArray` maps "custom"/"c" to `m_focusCustom`, so "c" must
    // not fall through to the middle slot the way `parseCharacterSlot` maps
    // it. Custom slots are unmodeled, so those tokens light nothing.
    const focusSlotTokens: Record<string, string> = {
      l: "l",
      left: "l",
      m: "m",
      middle: "m",
      r: "r",
      right: "r",
    };
    const slots = focus
      .split(",")
      .map((value) => focusSlotTokens[value.trim()])
      .filter((slot): slot is string => slot !== undefined);
    return [...new Set(slots)];
  }
}
