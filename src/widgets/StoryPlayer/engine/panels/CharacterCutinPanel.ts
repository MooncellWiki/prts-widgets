import {
  exactArg,
  parseVector2,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
} from "../commandParams";

import type { CharacterRefResolution } from "../characterRef";
import type { CommandRegistry, CommandResult } from "../commandRegistry";
import type {
  InterludeElementType,
  InterludeInput,
  ParsedCommandLine,
  RuntimeWarning,
  StoryRenderer,
} from "../types";

interface CharacterCutinPlayback {
  calculateFadeMs: (seconds: unknown, fallback: number) => number;
  resolveCharacterName: (ref: string) => CharacterRefResolution;
  warn: (type: RuntimeWarning["type"], detail: string) => void;
  warnNativeSlotThrows: (ref: string, line: ParsedCommandLine) => void;
}

function parseInterludeType(value: unknown): InterludeElementType {
  const raw = toString(value).trim();
  if (raw === "uichar") return 1;
  if (raw === "bg") return 2;
  if (raw === "char") return 3;
  const numeric = Math.trunc(toNumber(value, 0));
  return numeric === 1 || numeric === 2 || numeric === 3 ? numeric : 0;
}

/** Native port: Torappu.AVG.AVGCharacterCutinPanel (2791 GetExecutors @ 0x18419E7E0). */
export class CharacterCutinPanel {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      | "clearCharacterCutin"
      | "clearInterludes"
      | "setCharacterCutin"
      | "setInterlude"
    >,
    private readonly playback: CharacterCutinPlayback,
  ) {}

  register(registry: CommandRegistry<CommandResult>): void {
    registry.register("charactercutin", (line) =>
      this.executeCharacterCutin(line),
    );
    registry.register("interlude", (line) => this.executeInterlude(line));
  }

  /** AVGCharacterCutinPanel.ShouldResetOnSkip (2791 @ 0x18419EB20). */
  async resetOnSkip(isDestroyed: () => boolean): Promise<void> {
    await this.renderer.clearInterludes();
    if (!isDestroyed()) await this.renderer.clearCharacterCutin();
  }

  private async executeCharacterCutin(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
    const { args } = line;
    const widgetId = toString(args.widgetID);
    if (!widgetId) {
      this.playback.warn("parse", "charactercutin widgetID is empty");
      return "continue";
    }

    const nameRef = toString(args.name).trim();
    const resolution = nameRef
      ? this.playback.resolveCharacterName(nameRef)
      : null;
    if (resolution?.kind === "native_throws") {
      this.playback.warnNativeSlotThrows(nameRef, line);
      return "continue";
    }
    const resolved = resolution?.kind === "found" ? resolution.selection : null;
    // _ExecuteCharacterCutin (2791 @ 0x18419ECB0) uses the cut-in slot's
    // serialized defaults (_defaultFadetime = 0.4, _defaultSlotWidth = 200).
    // AVGCharacterCutinSlot implements IFadeTimeRatio, so Show, SlotUpdate,
    // and Hide all scale fadetime by animateRatio.
    const fadeMs = Math.round(
      this.playback.calculateFadeMs(args.fadetime, 0.4),
    );
    const block = toBoolean(args.block, false);

    // Native allocates the slot and runs its tween even if it can't resolve
    // the character art. Keep the block timing and flag the missing art.
    if (nameRef && !resolved) {
      this.playback.warn("missing_asset", `charactercutin: ${nameRef}`);
    }

    const fadeStyleRaw = toString(args.fadestyle).trim().toLowerCase();
    const validFadeStyles = [
      "fade",
      "horiz_expand_center",
      "horiz_expand_left2right",
      "horiz_expand_right2left",
      "vert_expand_center",
      "vert_expand_top2bottom",
      "vert_expand_bottom2top",
    ] as const;
    const fadeStyle = validFadeStyles.includes(
      fadeStyleRaw as (typeof validFadeStyles)[number],
    )
      ? (fadeStyleRaw as (typeof validFadeStyles)[number])
      : undefined;

    // AVGCharacterCutinSlot.Show/SlotUpdate read the case-sensitive layout
    // keys verbatim. Preserve omitted values so Show can use the prefab
    // defaults and SlotUpdate can hold the slot's current values.
    await this.renderer.setCharacterCutin({
      block,
      characterKey: resolved?.base,
      characterMissing: Boolean(nameRef) && !resolved,
      charOffsetX: toOptionalNumber(args.charOffsetX),
      charOffsetY: toOptionalNumber(args.charOffsetY),
      expression: resolved?.expression,
      fadeMs,
      fadeStyle,
      offsetX: toOptionalNumber(args.offsetx),
      offsetY: toOptionalNumber(args.offsety),
      povX: toOptionalNumber(args.povX),
      povY: toOptionalNumber(args.povY),
      widgetId,
      width: toOptionalNumber(args.width),
      zoom: toOptionalNumber(args.zoom),
    });
    return "continue";
  }

  private async executeInterlude(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
    // _ExecuteInterlude and _GenCutinParamWithCommand (2791 @ 0x18419F250 /
    // 0x18419F4E0). Validation uses channel default 0. CutinParam uses -1.
    // _EnsureDialogExtra supplies icharpos and icharscale to the dialog template.
    const { args } = line;
    const channelArg = exactArg(args, "channel");
    const checkedChannel = Math.trunc(toNumber(channelArg, 0));
    if (checkedChannel < 0) {
      this.playback.warn(
        "invalid_parameter",
        `interlude channel is invalid: ${checkedChannel}`,
      );
      return "continue";
    }

    const channel = Math.trunc(toNumber(channelArg, -1));
    const type = parseInterludeType(exactArg(args, "type"));
    const name = toString(exactArg(args, "name"));
    // Type 3 uses the AVG portrait pipeline. Type 1 loads from
    // Cutin/Characters via ResourceUrls.GetCutinCharPath.
    const avatarResolution =
      type === 3 && name ? this.playback.resolveCharacterName(name) : null;
    if (avatarResolution?.kind === "native_throws") {
      this.playback.warnNativeSlotThrows(name, line);
      return "continue";
    }
    const resolvedAvatar =
      avatarResolution?.kind === "found" ? avatarResolution.selection : null;
    if (type === 3 && name && !resolvedAvatar)
      this.playback.warn("missing_asset", `interlude avatar: ${name}`);

    const positionFrom = parseVector2(exactArg(args, "pfrom"));
    const positionTo = parseVector2(exactArg(args, "pto"));
    const scaleFrom = parseVector2(exactArg(args, "sfrom"));
    const scaleTo = parseVector2(exactArg(args, "sto"));
    const duration = (key: string): number =>
      Math.round(this.playback.calculateFadeMs(exactArg(args, key), 0));

    await this.renderer.setInterlude({
      alphaDurationMs: duration("aduration"),
      alphaFrom: toNumber(exactArg(args, "afrom"), -1),
      alphaTo: toNumber(exactArg(args, "ato"), -1),
      avatarCharacterKey: resolvedAvatar?.base,
      avatarExpression: resolvedAvatar?.expression,
      block: toBoolean(exactArg(args, "block"), false),
      channel,
      charName: toString(exactArg(args, "char")),
      clear: toBoolean(exactArg(args, "clear"), false),
      dialogCharPos: parseVector2(exactArg(args, "icharpos")),
      dialogCharScale: parseVector2(exactArg(args, "icharscale")),
      direction: toString(exactArg(args, "direction")),
      durationMs: duration("duration"),
      maskId: toString(exactArg(args, "maskid")),
      name,
      offset: parseVector2(exactArg(args, "offset")) ?? { x: 0, y: 0 },
      positionFrom: positionFrom && positionTo ? positionFrom : undefined,
      positionTo: positionFrom && positionTo ? positionTo : undefined,
      scaleDurationMs: duration("sduration"),
      scaleFrom: scaleFrom && scaleTo ? scaleFrom : undefined,
      scaleTo: scaleFrom && scaleTo ? scaleTo : undefined,
      size: parseVector2(exactArg(args, "size")) ?? { x: 0, y: 0 },
      slot: toString(exactArg(args, "slot")),
      style: Math.trunc(toNumber(exactArg(args, "style"), 0)),
      // Native switch feeds the deco TwoStateToggle on each show or update.
      switchOn: toBoolean(exactArg(args, "switch"), false),
      templateSizeDurationMs: duration("tsduration"),
      templateSizeFrom: parseVector2(exactArg(args, "tsfrom")) ?? {
        x: 0,
        y: 0,
      },
      templateSizeTo: parseVector2(exactArg(args, "tsto")) ?? {
        x: 0,
        y: 0,
      },
      type,
    } satisfies InterludeInput);
    return "continue";
  }
}
