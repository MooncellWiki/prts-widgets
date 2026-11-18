import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import {
  boxedParamString as toString,
  exactArg,
  getBool,
  parseEnumInt32,
  tryConvertToInt32,
  tryConvertToSingle,
  tryParseInt32,
} from "../commandParams";
import { parseShowItemFadeStyle, ShowItemFadeStyle } from "../showitem";

import type { CharacterRefResolution } from "../characterRef";
import type {
  CharacterCutinInput,
  InterludeElementType,
  InterludeInput,
  ParsedCommandLine,
  RuntimeWarning,
  StoryCommandArgs,
  StoryRenderer,
} from "../types";

interface CharacterCutinPlayback {
  animateRatio: () => number;
  resolveCharacterName: (ref: string) => CharacterRefResolution;
  warn: (type: RuntimeWarning["type"], detail: string) => void;
}

function parseInterludeType(value: unknown): InterludeElementType {
  const raw = toString(value);
  if (raw === "uichar") return 1;
  if (raw === "bg") return 2;
  if (raw === "char") return 3;
  // _GenCutinType (2791 @ 0x1841A01A0) uses Int32.TryParse.
  return tryParseInt32(raw) ?? 0;
}

/** DotNetExtensionMethods.GetFloat reads the boxed value using the invariant culture. */
function getFloat(args: StoryCommandArgs, key: string): number | undefined {
  const value = exactArg(args, key);
  return value === undefined
    ? undefined
    : (tryConvertToSingle(value) ?? undefined);
}

const CUTIN_ALIGN = { HORIZONTAL: 0, VERTICAL: 1 } as const;

/** _GenCutinParamWithCommand / _ParseVector (2791 @ 0x18419F4E0 / 0x1841A0640). */
function interludeVector(value: unknown): { x: number; y: number } | undefined {
  const raw = toString(value);
  if (!raw) return undefined;
  const [first = "", second = ""] = raw.split(",", 2);
  const x = tryConvertToSingle(first);
  const y = tryConvertToSingle(second);
  // A nonempty parameter enables the track even when Single.TryParse fails.
  return x === null || y === null ? { x: 0, y: 0 } : { x, y };
}

/** Native port: Torappu.AVG.AVGCharacterCutinPanel (2791 GetExecutors @ 0x18419E7E0). */
export class CharacterCutinPanel extends ExecutorComponent {
  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      | "clearCharacterCutin"
      | "clearInterludes"
      | "setCharacterCutin"
      | "setInterlude"
    >,
    private readonly playback: CharacterCutinPlayback,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      charactercutin: (line, isCurrent) =>
        this.executeCharacterCutin(line, isCurrent),
      interlude: (line, isCurrent) => this.executeInterlude(line, isCurrent),
    };
  }

  /**
   * OnReset (2791 @ 0x18419E970) recycles the slots before resetting
   * CutinController. ShouldResetOnSkip opts the panel into segment jumps.
   * ForceCommandEnd (0x18419E780) leaves the view cleanup to OnReset.
   */
  reset(): void {
    this.renderer.clearCharacterCutin();
    this.renderer.clearInterludes();
  }

  private fadeMs(args: StoryCommandArgs, key: string, fallback = 0): number {
    // AVGUtils.CalculateFadetime (2791 @ 0x184195010) multiplies two Singles.
    const seconds = getFloat(args, key) ?? Math.fround(fallback);
    return Math.fround(
      Math.fround(seconds * Math.fround(this.playback.animateRatio())) * 1000,
    );
  }

  private executeCharacterCutin(
    line: ParsedCommandLine,
    isCurrent?: () => boolean,
  ): ExecutorResult {
    const { args } = line;
    const widgetId = toString(args.widgetID);
    if (!widgetId) {
      this.playback.warn("parse", "charactercutin widgetID is empty");
      return "continue";
    }

    const nameRef = toString(args.name);
    const resolution = nameRef
      ? this.playback.resolveCharacterName(nameRef)
      : null;
    const resolved = resolution?.kind === "found" ? resolution.selection : null;
    // _ExecuteCharacterCutin (2791 @ 0x18419ECB0) uses the cut-in slot's
    // serialized defaults (_defaultFadetime = 0.4, _defaultSlotWidth = 200).
    // AVGCharacterCutinSlot implements IFadeTimeRatio, so Show, SlotUpdate,
    // and Hide all scale fadetime by animateRatio.
    const fadeMs = this.fadeMs(args, "fadetime", 0.4);
    const block = getBool(args, "block");

    // Native allocates the slot and runs its tween even if it can't resolve
    // the character art. Keep the block timing and flag the missing art.
    if (resolution?.kind === "missing") {
      this.playback.warn("missing_asset", `charactercutin: ${nameRef}`);
    }

    // AVGCharacterCutinSlot.Show (2791 @ 0x184203DA0) uses case-sensitive
    // GetEnum. Both native cut-in FadeStyle enums share names and ordinals.
    const fadeStyleRaw = toString(args.fadestyle);
    const ordinal = parseShowItemFadeStyle(fadeStyleRaw);
    const fadeStyle = fadeStyleRaw
      ? ((ShowItemFadeStyle[ordinal] as CharacterCutinInput["fadeStyle"]) ??
        ordinal)
      : undefined;

    // AVGCharacterCutinSlot.Show/SlotUpdate read the case-sensitive layout
    // keys verbatim. Preserve omitted values for Show's prefab defaults
    // and SlotUpdate's defaults derived from the live transforms.
    // Show (2791 @ 0x184203DA0) reads Align with case-sensitive Enum.Parse.
    const align = parseEnumInt32(toString(args.align), CUTIN_ALIGN);
    const input: CharacterCutinInput = {
      align: (["horizontal", "vertical"] as const)[align] ?? align,
      backgroundKey: toString(args.background) || undefined,
      backgroundOffset: getFloat(args, "backgroundOffset"),
      block,
      characterKey: resolved?.base,
      characterMissing: resolution?.kind === "missing",
      ...(resolution?.kind === "native_throws" && {
        invalidCharacterRef: true,
      }),
      characterRef: nameRef || undefined,
      charOffsetX: getFloat(args, "charOffsetX"),
      charOffsetY: getFloat(args, "charOffsetY"),
      expression: resolved?.expression,
      fadeMs,
      fadeStyle,
      offsetX: getFloat(args, "offsetx"),
      offsetY: getFloat(args, "offsety"),
      povX: getFloat(args, "povX"),
      povY: getFloat(args, "povY"),
      widgetId,
      // GetInt (2791 @ 0x186941320) converts boxed values with ToInt32.
      width: tryConvertToInt32(exactArg(args, "width")) ?? undefined,
      zoom: getFloat(args, "zoom"),
    };
    const animation = this.renderer.setCharacterCutin(
      input,
      block ? () => this.finishIfCurrent(isCurrent) : undefined,
    );
    return animation ? { animation, block: true } : "continue";
  }

  private executeInterlude(
    line: ParsedCommandLine,
    isCurrent?: () => boolean,
  ): ExecutorResult {
    // _ExecuteInterlude and _GenCutinParamWithCommand (2791 @ 0x18419F250 /
    // 0x18419F4E0). Validation uses channel default 0. CutinParam uses -1.
    // _EnsureDialogExtra supplies icharpos and icharscale to the dialog template.
    const { args } = line;
    const channelArg = tryConvertToInt32(exactArg(args, "channel"));
    const checkedChannel = channelArg ?? 0;
    if (checkedChannel < 0) {
      this.playback.warn(
        "invalid_parameter",
        `interlude channel is invalid: ${checkedChannel}`,
      );
      return "continue";
    }

    const channel = channelArg ?? -1;
    const type = parseInterludeType(exactArg(args, "type"));
    const name = toString(exactArg(args, "name"));
    const positionFrom = interludeVector(exactArg(args, "pfrom"));
    const positionTo = interludeVector(exactArg(args, "pto"));
    const scaleFrom = interludeVector(exactArg(args, "sfrom"));
    const scaleTo = interludeVector(exactArg(args, "sto"));
    const duration = (key: string): number => this.fadeMs(args, key);

    const block = getBool(args, "block");
    const input = {
      alphaDurationMs: duration("aduration"),
      alphaFrom: getFloat(args, "afrom") ?? -1,
      alphaTo: getFloat(args, "ato") ?? -1,
      block,
      channel,
      charName: toString(exactArg(args, "char")),
      clear: getBool(args, "clear"),
      dialogCharPos: interludeVector(exactArg(args, "icharpos")),
      dialogCharScale: interludeVector(exactArg(args, "icharscale")),
      direction: toString(exactArg(args, "direction")),
      durationMs: duration("duration"),
      maskId: toString(exactArg(args, "maskid")),
      name,
      offset: interludeVector(exactArg(args, "offset")) ?? { x: 0, y: 0 },
      positionFrom: positionFrom && positionTo ? positionFrom : undefined,
      positionTo: positionFrom && positionTo ? positionTo : undefined,
      scaleDurationMs: duration("sduration"),
      scaleFrom: scaleFrom && scaleTo ? scaleFrom : undefined,
      scaleTo: scaleFrom && scaleTo ? scaleTo : undefined,
      size: interludeVector(exactArg(args, "size")) ?? { x: 0, y: 0 },
      slot: toString(exactArg(args, "slot")),
      // Command.TryGetParam<int> (2791 @ 0x18419AF30) uses Convert.ToInt32.
      style: tryConvertToInt32(exactArg(args, "style")) ?? 0,
      // Native switch feeds the deco TwoStateToggle on each show or update.
      switchOn: getBool(args, "switch"),
      templateSizeDurationMs: duration("tsduration"),
      templateSizeFrom: interludeVector(exactArg(args, "tsfrom")) ?? {
        x: 0,
        y: 0,
      },
      templateSizeTo: interludeVector(exactArg(args, "tsto")) ?? {
        x: 0,
        y: 0,
      },
      type,
    } satisfies InterludeInput;
    const animation = this.renderer.setInterlude(
      input,
      block ? () => this.finishIfCurrent(isCurrent) : undefined,
    );
    return animation ? { animation, block: true } : "continue";
  }

  private finishIfCurrent(isCurrent?: () => boolean): void {
    // A renderer callback belongs to the playback generation that started it.
    if (isCurrent?.() !== false) this.finishCommand();
  }
}
