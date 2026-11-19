import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import { nativeCharacterFadeIdentity } from "../characterRef";
import {
  exactArg,
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
  CharacterActionInput,
  CharacterSlotInput,
  ParsedCommandLine,
  StoryRenderer,
} from "../types";

/** Torappu.AVG.CharacterPanel.GetExecutors (2791 @ 0x1841BF980). */
export class CharacterPanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "clearCharacters" | "runCharacterAction" | "setCharacter"
    >,
    private readonly playback: CharacterCommandContext,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      character: (line, isCurrent) =>
        this.show(line, isCurrent ?? (() => true)),
      characteraction: (line) => this.act(line),
    };
  }

  private show(
    line: ParsedCommandLine,
    isCurrent: () => boolean,
  ): ExecutorResult | Promise<ExecutorResult> {
    const { args } = line;
    const nameRef = toString(args.name);
    const name2Ref = toString(args.name2);
    const focus = toNumber(args.focus, 0);
    const durationMs = this.playback.calculateFadeMs(args.fadetime, 0.15);
    // _ExecuteCharacter (2791 @ 0x1841C1510) returns isblock without
    // installing a completion callback. Web keeps character display nonblocking.
    const block = false;
    // ECharTransType: 0 = NONE, 1 = ALPHA_IN, 2 = ALPHA_OUT. Native default 0.
    const transType = Math.trunc(toNumber(args.transtype, 0));
    const hasRightCharacter = Boolean(name2Ref);
    // Native processes slots MIDDLE -> LEFT -> RIGHT (same frame, sync).
    const updates = [
      {
        blackEnd: args.blackend,
        blackStart: args.blackstart,
        enter: args.enter,
        name: nameRef && !name2Ref ? nameRef : "",
        slot: "m",
        x: args.xpos1,
        y: args.ypos1,
      },
      {
        blackEnd: args.blackend,
        blackStart: args.blackstart,
        enter: args.enter,
        name: hasRightCharacter ? nameRef : "",
        slot: "l",
        x: args.xpos1,
        y: args.ypos1,
      },
      {
        blackEnd: args.blackend2,
        blackStart: args.blackstart2,
        enter: args.enter2,
        name: name2Ref,
        slot: "r",
        x: args.xpos2,
        y: args.ypos2,
      },
    ] as const;

    const applyFrom = (start: number): "continue" | Promise<"continue"> => {
      for (let index = start; index < updates.length; index += 1) {
        const update = updates[index]!;
        if (!update.name) {
          void this.renderer.clearCharacters(update.slot, durationMs);
          continue;
        }
        const resolution = this.playback.resolveCharacterName(update.name);
        // Slots run MIDDLE -> LEFT -> RIGHT, so the ones before the throw
        // have already changed in native too; the rest never run.
        if (resolution.kind === "native_throws")
          return warnNativeSlotThrows(this.playback.warn, update.name, line);
        if (resolution.kind === "missing")
          this.playback.warn("missing_asset", `character: ${update.name}`);
        const resolved =
          resolution.kind === "found" ? resolution.selection : undefined;
        const enterFrom = this.parseEnterDirection(update.enter);
        // Native `_ProcessSlotWithParam` takes xpos/ypos as the slide-in
        // start -- a slot-local offset that `SetCharPos` tweens back to
        // (0,0) -- but only when `TryGetParam` finds *both*; otherwise it
        // falls back to `_GenPosition`. Either way `_ProcessSlot` applies
        // the position only on the `enter` branch, so without a legal
        // `enter` the values never reach the screen. They are read as
        // Int32, and Unity y is up while the renderer is y-down.
        const enterPosition =
          enterFrom && update.x !== undefined && update.y !== undefined
            ? {
                x: Math.trunc(toNumber(update.x, 0)),
                y: -Math.trunc(toNumber(update.y, 0)),
              }
            : undefined;
        const preparation = this.renderer.setCharacter({
          blackEnd: toNumber(update.blackEnd, Number.NaN),
          blackStart: toNumber(update.blackStart, Number.NaN),
          block,
          characterKey: resolved?.base,
          // Native: LEFT/MIDDLE use `(unsigned)focus <= 1 -> focusColor`,
          // RIGHT uses `(focus & 0xFFFFFFFD) == 0 -> focusColor`.
          dimmed:
            update.slot === "r" ? ![0, 2].includes(focus) : focus >>> 0 > 1,
          durationMs,
          enterFrom,
          enterPosition,
          expression: resolved?.expression,
          fadeIdentity: nativeCharacterFadeIdentity(update.name),
          focus,
          nativeKey: update.name,
          slot: update.slot,
          transType,
        });
        if (!isCurrent()) return "continue";
        if (preparation)
          return preparation.completion.then(() => {
            if (!isCurrent()) return "continue";
            if (preparation.failure) throw preparation.failure.error;
            return preparation.endReason === "complete"
              ? applyFrom(index + 1)
              : "continue";
          });
      }
      return "continue";
    };

    return applyFrom(0);
  }

  private act({ args }: ParsedCommandLine): ExecutorResult {
    // _ExecuteCharacterAction (2791 @ 0x1841BFE80) scales fadetime and
    // uses isblock. _AddFinishCommand (0x1841BFD70) attaches OnComplete
    // only when a blocking action returns a tween.
    const type = this.parseCharacterActionType(args.type);
    if (!type) {
      this.playback.warn(
        "parse",
        `characteraction type is invalid: ${toString(args.type)}`,
      );
      return "continue";
    }
    // GetOrDefault("name", "left"): a missing key resolves through the
    // "left" arm of each truth table (exit → left slot, others → left),
    // while an unrecognized value hits the else fallback instead.
    const slot = this.parseCharacterActionSlot(
      exactArg(args, "name") === undefined ? "left" : args.name,
      type,
    );

    // Per-branch GetOrDefault defaults: exit/zoom fade in for 1.0s while
    // move/jump/shake default to 0.5s.
    const fadetimeFallback = type === "exit" || type === "zoom" ? 1 : 0.5;
    const scaledMs = this.playback.calculateFadeMs(
      exactArg(args, "fadetime"),
      fadetimeFallback,
    );

    // NeedSkipAnimation, MoveChar and SetCharPos (2791 @ 0x1841BFB10,
    // 0x1842370A0, 0x1842375B0) use MathUtil.IsZero on the scaled seconds.
    // Jump and shake fall back to an immediate move. CharZoom creates a tween.
    const durationMs =
      type !== "zoom" && isZeroFloat(scaledMs / 1000) ? 0 : scaledMs;
    const effectiveType: CharacterActionInput["type"] =
      (type === "jump" || type === "shake") && durationMs <= 0 ? "move" : type;

    let pivot: { x: number; y: number } | undefined;
    if (type === "zoom") {
      // xpos/ypos are the [0,1] pivot of the character image (default
      // 0.5/0.5). AVGCharacterSlot.CharZoom (0x184236B10) returns null
      // for pivots outside [0,1], making the whole command a no-op.
      const pivotX = toNumber(args.xpos, 0.5);
      const pivotY = toNumber(args.ypos, 0.5);
      if (pivotX < 0 || pivotX > 1 || pivotY < 0 || pivotY > 1) {
        this.playback.warn(
          "parse",
          `characteraction zoom pivot out of range: xpos=${toString(args.xpos)}, ypos=${toString(args.ypos)}`,
        );
        return "continue";
      }
      pivot = { x: pivotX, y: pivotY };
    }

    // Native exit reads xpos/ypos only when BOTH are present
    // (TryGetParam<int>) and hands them to SetCharPos in place of the
    // _GenExitPosition row: an absolute `_offset.localPosition`, i.e. a
    // displacement from the slot's rest anchor, not story coordinates.
    // `direction` accepts left/right/up/down and defaults to "left"
    // when the key is missing; an unrecognized value falls through as
    // undefined (native exits to the (0,0) rest anchor).
    const hasExitX = exactArg(args, "xpos") !== undefined;
    const hasExitY = exactArg(args, "ypos") !== undefined;
    const parsedDirection = this.parseCharacterActionDirection(args.direction);
    const direction =
      type === "exit"
        ? (parsedDirection ??
          (exactArg(args, "direction") === undefined ? "left" : undefined))
        : parsedDirection;

    // `scale` resets to the native 1.0 default when omitted and passes
    // through unclamped (native LerpUnclamped accepts negative scale,
    // which mirrors the sprite); xscale/yscale are web extensions (the
    // native panel never reads them).
    const scaleFallback = toNumber(args.scale, 1);
    const xScale =
      args.xscale === undefined
        ? scaleFallback
        : toNumber(args.xscale, scaleFallback);
    const yScale =
      args.yscale === undefined
        ? scaleFallback
        : toNumber(args.yscale, scaleFallback);

    const animation = this.renderer.runCharacterAction(
      {
        // Native reads the pair via TryGetParam<int>, i.e. the JSON doubles
        // go through Convert.ToInt32's banker's rounding before the cast.
        absolutePosition:
          type === "exit" && hasExitX && hasExitY
            ? {
                x: toNativeIntParam(args.xpos, 0),
                y: toNativeIntParam(args.ypos, 0),
              }
            : undefined,
        block: toBoolean(args.isblock, false),
        direction,
        durationMs,
        pivot,
        // jump/shake GetOrDefault defaults: power 10, int times 3. Power is
        // unclamped — native DOLocalJump/DOShakePosition take it as-is, so
        // a negative value bounces/shakes downward like the client.
        power: toNumber(args.power, 10),
        // Native key is `random` (int, DOShakePosition randomness degrees,
        // default 10); `randomness=` is not read by the native panel.
        randomness: toNativeIntParam(args.random, 10),
        // start/leftend/rightend and stop are web extensions kept for
        // charslot-style scripts; the native panel never reads them.
        rotationFromDeg: toNumber(args.start, 0),
        rotationLeftDeg:
          args.leftend === undefined ? -15 : -toNumber(args.leftend, 15),
        rotationRightDeg:
          args.rightend === undefined ? 15 : toNumber(args.rightend, 15),
        scaleX: xScale,
        scaleY: yScale,
        slot,
        stop: toBoolean(args.stop, false),
        times: toNativeIntParam(args.times, 3),
        type: effectiveType,
        xOffset: type === "zoom" ? 0 : toNumber(args.xpos, 0),
        yOffset: type === "zoom" ? 0 : toNumber(args.ypos, 0),
      },
      this.finishCommand,
    );
    return { animation, block: true };
  }

  private parseEnterDirection(value: unknown): CharacterSlotInput["enterFrom"] {
    // Native compares the raw string ordinally against the four literals
    // left/right/up/down; anything else (including "middle") means no enter.
    const raw = toString(value);
    if (raw === "left" || raw === "right" || raw === "up" || raw === "down")
      return raw;
    return undefined;
  }

  private parseCharacterActionSlot(
    value: unknown,
    type: CharacterActionInput["type"],
  ): string {
    // Native compares GetOrDefault("name", "left") with String.op_Equality:
    // ordinal, case-sensitive, no trim. The "left" default for a missing key
    // is applied by the caller (exit's truth table maps "left" to the left
    // slot, not to the else fallback).
    const name = toString(value);
    if (name === "left") return "l";
    if (name === "right") return "r";
    if (name === "middle") return "m";
    return type === "exit" ? "m" : "l";
  }

  private parseCharacterActionType(
    value: unknown,
  ): CharacterActionInput["type"] | undefined {
    // _ExecuteCharacterAction matches the five literals with
    // String.op_Equality (ordinal; 2791 @ 0x1841BFE80) — "MOVE" is an
    // unknown type that logs an error and never blocks, not a match.
    const type = toString(value);
    if (
      type === "exit" ||
      type === "jump" ||
      type === "move" ||
      type === "shake" ||
      type === "zoom"
    ) {
      return type;
    }
    return undefined;
  }

  private parseCharacterActionDirection(
    value: unknown,
  ): CharacterActionInput["direction"] | undefined {
    // _GenExitPosition (2791 @ 0x1841C1B70) recognizes exactly
    // left/right/up/down via String.op_Equality (ordinal, case-sensitive);
    // anything else resolves to the (0,0) rest anchor (renderer handles
    // undefined that way). The "left" default for a missing key is applied by
    // the exit branch, matching GetOrDefault("direction", "left").
    const direction = toString(value);
    if (
      direction === "down" ||
      direction === "left" ||
      direction === "right" ||
      direction === "up"
    ) {
      return direction;
    }
    return undefined;
  }
}
