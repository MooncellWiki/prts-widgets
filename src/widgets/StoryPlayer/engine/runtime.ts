import mitt, { type Handler } from "mitt";

import { resolveStoryAudioByKey, resolveStoryVideoByKey } from "./asset";
import { resolveAvgDisplaySlot, resolveAvgDisplayStyle } from "./avgDisplay";
import {
  type CharacterRefResolution,
  nativeCharacterFadeIdentity,
  resolveCharacterRef,
} from "./characterRef";
import {
  exactArg,
  parseSubtitleAlignment,
  parseVector2,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
} from "./commandParams";
import { CommandRegistry, type CommandResult } from "./commandRegistry";
import {
  parseDecision,
  parsePredicateReferences,
  passesGate,
} from "./log/semantics";
import { DialogPanel } from "./panels/DialogPanel";
import { StickerPanel } from "./panels/StickerPanel";
import { parseScript } from "./parser";
import { parseShowItemFadeStyle } from "./showitem";
import { expandStoryText } from "./textVariables";

import type { Context } from "../context";
import type {
  AutoPlayMode,
  AutoPlayState,
  AvgDisplayInput,
  BackgroundInput,
  CharacterActionInput,
  CharacterSlotInput,
  DecisionPolicy,
  InterludeElementType,
  InterludeInput,
  LineSeekUpdate,
  ParsedCommandLine,
  PlayerState,
  RuntimeChoiceSelection,
  RuntimeLogPosition,
  RuntimeOptions,
  RuntimeWarning,
  SpellStickerInput,
  StoryAudio,
  StoryCommandArgs,
  StoryPlayerEvents,
  StoryRenderer,
  SubtitleInput,
} from "./types";

interface AutoSpeed {
  animateRatio: number;
  autoWaitBaseTime: number;
  autoWaitTimePerText: number;
  typeWriterDelayMs: number;
}

const BUTTON_AUTO_SPEEDS: readonly AutoSpeed[] = [
  {
    animateRatio: 1,
    autoWaitBaseTime: 1.5,
    autoWaitTimePerText: 0.03,
    typeWriterDelayMs: 40,
  },
  {
    animateRatio: 1,
    autoWaitBaseTime: 0.5,
    autoWaitTimePerText: 0.015,
    typeWriterDelayMs: 10,
  },
  {
    animateRatio: 1,
    autoWaitBaseTime: 0.25,
    autoWaitTimePerText: 0.01,
    typeWriterDelayMs: 10,
  },
];

const QUICK_AUTO_SPEEDS: readonly AutoSpeed[] = [
  {
    animateRatio: 0,
    autoWaitBaseTime: 0.2,
    autoWaitTimePerText: 0,
    typeWriterDelayMs: 10,
  },
  {
    animateRatio: 0,
    autoWaitBaseTime: 0.1,
    autoWaitTimePerText: 0,
    typeWriterDelayMs: 5,
  },
  {
    animateRatio: 0,
    autoWaitBaseTime: 0.05,
    autoWaitTimePerText: 0,
    typeWriterDelayMs: 2.5,
  },
  {
    animateRatio: 0,
    autoWaitBaseTime: 0.025,
    autoWaitTimePerText: 0,
    typeWriterDelayMs: 1.25,
  },
];

const builtinCommandNames = [
  "delay",
  "video",
  "skipnode",
  "skiptothis",
  "label",
  "warp",
  "gotostage",
  "background",
  "backgroundtween",
  "gridbg",
  "verticalbg",
  "largebg",
  "largeimg",
  "image",
  "showitem",
  "hideitem",
  "imagetween",
  "imagerotate",
  "largebgtween",
  "largeimgtween",
  "blocker",
  "curtain",
  "charslot",
  "character",
  "characteraction",
  "charactercutin",
  "interlude",
  "animtext",
  "avgdisplay",
  "playmusic",
  "stopmusic",
  "musicvolume",
  "playsound",
  "stopsound",
  "soundvolume",
  "cameraeffect",
  "camerashake",
  "focusout",
  "focusparam",
  "subtitle",
  "spellsticker",
  "spellstickerclear",
  "theater",
  "decision",
  "predicate",
  "bgeffect",
  "cgitem",
  "effect",
  "hidecgitem",
] as const;

const unsupportedAd8Commands = new Set(["bgeffect", "effect"]);

interface InterruptibleWait {
  id: number;
  interrupt?: () => void;
  resolve: () => void;
}

function sleepWithTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Native port: `Command.GetOrDefault<int>` runs the JSON-boxed parameter value
 * through `System.Convert.ToInt32`. AVGParser wraps the parameter list in JSON,
 * so `random=true` arrives as a real boolean and converts to 1 (false to 0) --
 * it never means "enabled".
 */
function toNativeIntParam(value: unknown, fallback: number): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === "true") return 1;
  if (value === "false") return 0;
  return roundHalfToEven(toNumber(value, fallback));
}

/** `System.Convert.ToInt32(double)` rounds half to even, not toward zero. */
function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function parseNumberSequence(value: unknown): number[] {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (typeof value !== "string") return [];

  return value
    .split("/")
    .map((part) => {
      const normalized = part.trim().replaceAll(",", "");
      return Number(normalized);
    })
    .filter((item) => Number.isFinite(item));
}

/**
 * Native port: `Torappu.AVG.CommandParser.ParseRotateParam` parses `rto` /
 * `rfrom` as Vector3 and feeds only the z component to `DORotate`. Scripts
 * are expected to write "x,y,z"; a bare number is accepted as a z-only
 * shorthand (web adaptation -- the native Vector3 parser is stricter, but no
 * shipped script writes the key at all, so the relaxation is harmless).
 */
function parseCgVector2(value: unknown): { x: number; y: number } | undefined {
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

function parseCgColor(
  value: unknown,
): { r: number; g: number; b: number; a: number } | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value.split(",");
  if (parts.length !== 4) return undefined;
  const values = parts.map((part) => {
    const parsed = Number.parseFloat(part.trim());
    return Number.isFinite(parsed) ? parsed : 1;
  });
  return { a: values[3]!, b: values[2]!, g: values[1]!, r: values[0]! };
}

function parseInterludeType(value: unknown): InterludeElementType {
  const raw = toString(value).trim();
  if (raw === "uichar") return 1;
  if (raw === "bg") return 2;
  if (raw === "char") return 3;
  const numeric = Math.trunc(toNumber(value, 0));
  return numeric === 1 || numeric === 2 || numeric === 3 ? numeric : 0;
}

function resolveGroupedAssetSelection(
  imageGroup: string,
  cgGroup: string,
  imageGroupKind: "background" | "image" = "background",
): { assetKind: "background" | "image"; groupValue: string } | null {
  if (imageGroup) return { assetKind: imageGroupKind, groupValue: imageGroup };
  if (cgGroup) return { assetKind: "image", groupValue: cgGroup };
  return null;
}

type SkipMode = "skip" | "nofirstskip";

interface SkipNodeLabel {
  lineIndex: number;
  mode: SkipMode;
}

function preprocessSkipNodes(
  lines: ReturnType<typeof parseScript>,
): SkipNodeLabel[] {
  const labels: SkipNodeLabel[] = [];

  for (const [index, line] of lines.entries()) {
    if (line.kind !== "command" || line.command !== "skipnode") continue;

    // Native port: Torappu.AVG.AVGStoryCache.AddSkipNode (2.7.81 VA
    // 0x183FCD3E0) reads the mode via GetOrDefault("mode", "skip"), then
    // CalSkipMode (0x183FCD6A0) maps only the exact lower-case sentinel
    // "nofirstskip" to FIRST_CANNOT_SKIP; every other value falls back to
    // CAN_SKIP. The key lookup is exact as well: Command.param is the
    // Json.NET-deserialized Dictionary<string, object> with the default
    // ordinal comparer (AVGParser._ParseCommand 0x183FFBB30), so a `Mode=`
    // spelling misses and reads the "skip" default.
    const mode =
      toString(line.args.mode, "skip") === "nofirstskip"
        ? "nofirstskip"
        : "skip";
    labels.push({ lineIndex: index, mode });
  }

  return labels;
}

function preprocessSkipToIndex(lines: ReturnType<typeof parseScript>): number {
  return lines.findIndex(
    (line) => line.kind === "command" && line.command === "skiptothis",
  );
}

function preprocessLabelMap(
  lines: ReturnType<typeof parseScript>,
): Map<string, number> {
  // Native port: Torappu.AVG.GotoLabelController.PreprocessCommands. It scans
  // only `label` commands; TryGetParam("name") failing (missing key) makes the
  // line a silent ignore -- no registration, no warning. RegisterLabel stores
  // the bare index of the label line itself; the +1 skip offset is applied by
  // the warp executor (_ExecuteGoto), not here. A repeated name overwrites the
  // earlier entry (Dictionary set_Item).
  const labelMap = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    if (line.kind !== "command" || line.command !== "label") continue;
    if (!Object.prototype.hasOwnProperty.call(line.args, "name")) continue;
    labelMap.set(toString(line.args.name), index);
  }
  return labelMap;
}

/**
 * Native 的选项渲染上限是 DecisionPanel 预制体上 `_optionRoots` /
 * `m_optionTexts` 数组的长度（由 prefab 配置，代码里读不出具体值；
 * 2.7.61 现网语料单条 decision 最多 4 个选项）。超出时原生打
 * `[AVG] Too many decision options. Some will be ignored!` 并隐藏多余
 * 按钮；web 侧只降级为 warning、仍全量渲染（与 options 缺失路径同样
 * 的容错取向）。
 */
const DECISION_OPTION_CAPACITY = 4;

export class StoryRuntime {
  private readonly audio: StoryAudio;
  private readonly defaultSpeed: AutoSpeed;
  private autoPlayMode: AutoPlayMode = "default";
  private autoClickGeneration = 0;
  private buttonSpeedLevel = 0;
  private readonly commandRegistry = new CommandRegistry<CommandResult>();
  private readonly context: Context;
  private cursor = 0;
  /** 当前屏幕对话框正在显示的源行 lineNumber（cursor-1 那条）。null 表示无显示文本（初始/finished/video-only/纯命令推进） */
  private displayedLineIndexValue: number | null = null;
  /** Web 适配（无原生对应）：引擎向 UI 推送变更的事件总线，UI 用它替代轮询 */
  private readonly events = mitt<StoryPlayerEvents>();

  private get displayedLineIndex(): number | null {
    return this.displayedLineIndexValue;
  }

  private set displayedLineIndex(value: number | null) {
    if (this.displayedLineIndexValue === value) return;
    this.displayedLineIndexValue = value;
    this.events.emit("displayedLineChange", value);
    // 行号跳转的到达判断挂在赋值点：这里逐行必发，不会像采样轮询那样
    // 漏过 quick 最高档下的短行
    if (this.lineSeek && value === this.lineSeek.target) {
      const { onUpdate, target } = this.lineSeek;
      this.closeLineSeek();
      // 落在 [theater] 段内时点击全被吞掉，切手动就卡死：交还 theater 自己的
      // button_auto，等它的 exit 再按缓存恢复
      this.applyAutoPlayMode(this.theaterMode ? "button_auto" : "default");
      onUpdate({ phase: "reached", target });
    }
  }
  private decisionSelectValue = 0;
  private decisionReferences: number[] | null = null;
  /**
   * 挂在 DecisionPanel 上等点击的 decision；null = 没有。对象身份即令牌：
   * skipNode 只结算入口处取样到的那一个（中途被点掉、又走到下一个
   * decision 时不误结算新面板）。`autoPlayRestore` 是等待结束后还回去的
   * 模式，skip 的 SkipToThis 路径会把它改成 default。
   */
  private pendingDecision: { autoPlayRestore: AutoPlayMode } | null = null;
  /** 调试侧注入的自动决策钩子；null = 全部走 DecisionPanel 人工选择 */
  private decisionPolicy: DecisionPolicy | null = null;
  /** 进行中的行号跳转编排（seekToLine）；null = 无跳转 */
  private lineSeek: {
    choices: ReadonlyMap<number, number>;
    onUpdate: (update: LineSeekUpdate) => void;
    /** 跳转独占 decisionPolicy，收尾时把外部注入的那份还回去 */
    previousPolicy: DecisionPolicy | null;
    target: number;
  } | null = null;
  /** 实际执行过的全部选择（decisionId = 源行 lineNumber），供 Log All 路径求值 */
  private readonly choiceHistory: RuntimeChoiceSelection[] = [];
  private destroyed = false;
  private readonly lines: ReturnType<typeof parseScript>;
  private readonly firstRead: boolean;
  private pendingWait: InterruptibleWait | null = null;
  private pendingWaitId = 0;
  private processing = false;
  private processingCompletion: Promise<void> | null = null;
  private resolveProcessingCompletion: (() => void) | null = null;
  private readonly renderer: StoryRenderer;
  private readonly sleep: (ms: number) => Promise<void>;
  private currentSkipMode: SkipMode = "skip";
  private readonly skipNodeLabels: SkipNodeLabel[];
  private skipNodeQueueIndex = 0;
  private readonly skipToIndex: number;
  /**
   * Native port: Torappu.AVG.GotoLabelController.m_gotoIndex. One-shot warp
   * cursor; -1 means "no pending jump". warp sets it, processLoop reads and
   * resets it before fetching the next command (GotoCommandIndex's read-and-
   * reset-to--1), so each warp jumps exactly once and two consecutive warps
   * each take effect.
   */
  private gotoIndex = -1;
  /**
   * Native port: GotoLabelController.m_labelMap, filled by preprocessLabelMap
   * (label name -> bare line index). Native clears it only in
   * AVGGotoLabel.OnReset at story start; ShouldResetOnSkip() returns false
   * (2.7.81 VA 0x183fc3be0), so a skip keeps both the map and the cursor.
   */
  private readonly labelMap: Map<string, number>;
  /**
   * Native port: Torappu.AVG.AVGShowItemPanel's single `_slotInUse`.
   * It determines whether `_ExecuteHideItem` blocks.
   */
  private itemSlotInUse = false;
  private theaterMode = false;
  private theaterAutoPlayCache: AutoPlayState | null = null;
  private textTypingGeneration = 0;
  private quickSpeedLevel = 0;
  /** Raw, marked-up length reported by the text command that owns auto-click. */
  private currentRawMessageLength = 0;
  private currentTypingComplete = false;
  private state: PlayerState = "idle";
  private readonly dialogPanel: DialogPanel;
  private readonly stickerPanel: StickerPanel;
  private pendingInputEffect: (() => Promise<void> | void) | null = null;

  constructor(
    context: Context,
    renderer: StoryRenderer,
    audio: StoryAudio,
    options: RuntimeOptions = {},
  ) {
    this.context = context;
    this.lines = parseScript(context.scriptText ?? context.script);
    this.defaultSpeed = {
      animateRatio: Math.max(0, options.animateRatio ?? 1),
      autoWaitBaseTime: 1.5,
      autoWaitTimePerText: 0.03,
      typeWriterDelayMs: Math.max(0, Math.round(options.typingIntervalMs ?? 0)),
    };
    this.firstRead = options.firstRead ?? true;
    this.renderer = renderer;
    this.audio = audio;
    this.sleep = options.sleep ?? sleepWithTimeout;
    this.skipNodeLabels = preprocessSkipNodes(this.lines);
    this.skipToIndex = preprocessSkipToIndex(this.lines);
    this.labelMap = preprocessLabelMap(this.lines);
    this.onWarning = options.onWarning;
    this.dialogPanel = new DialogPanel(renderer, {
      beginTyping: (length) => this.beginTextTyping(length),
      cancelTyping: () => this.cancelTextTyping(),
      prepareEndtip: () => this.prepareEndtip(),
      setDisplayedLine: (lineNumber) => {
        this.displayedLineIndex = lineNumber;
      },
      sleep: this.sleep,
      translateText: (text) => this.translateText(text),
      typeWriterDelayMs: () => this.getCurrentSpeed().typeWriterDelayMs,
    });
    this.stickerPanel = new StickerPanel(renderer, {
      beginTyping: (length) => this.beginTextTyping(length),
      calculateFadeMs: (value, fallback) =>
        this.calculateFadeMs(value, fallback),
      raiseAutoClick: () => this.raiseStickerAutoClick(),
      typeWriterDelayMs: () => this.getCurrentSpeed().typeWriterDelayMs,
      translateText: (text) => this.translateText(text),
      warn: (detail) => this.warn("parse", detail),
    });
    this.dialogPanel.register(this.commandRegistry);
    this.stickerPanel.register(this.commandRegistry);
    for (const command of builtinCommandNames)
      this.commandRegistry.register(command, (line) =>
        this.executeBuiltinCommand(line),
      );
  }

  readonly onWarning?: (warning: RuntimeWarning) => void;

  getState(): PlayerState {
    return this.state;
  }

  /** 当前屏幕对话框正在显示的源行 lineNumber；null 表示当前没有显示文本 */
  getDisplayedLineIndex(): number | null {
    return this.displayedLineIndex;
  }

  /**
   * 把 UI 监听器包成不会反噬引擎的 handler。mitt 的 emit 不吞异常，而 5 个赋值点都
   * 在 processLoop 的 try 里，监听器直接抛会被那里的 catch 收成 state="error" 把播放
   * 打死；轮询时代 UI 侧的异常伤不到引擎，推送不能倒退，所以这里统一收成 warning。
   */
  private guardListener<T>(listener: Handler<T>): Handler<T> {
    return (event) => {
      try {
        listener(event);
      } catch (error) {
        this.onWarning?.({
          cursor: this.cursor,
          detail:
            error instanceof Error ? error.message : "story listener error",
          type: "error",
        });
      }
    };
  }

  /**
   * Web 适配（无原生对应）：注册显示行变更推送；赋值路径不变，经 setter 去重后回调。
   * 订阅时立即补发一次当前值，调用方不必自己播种。返回注销函数。
   */
  onDisplayedLineChange(
    listener: (lineIndex: number | null) => void,
  ): () => void {
    const handler = this.guardListener(listener);
    this.events.on("displayedLineChange", handler);
    handler(this.displayedLineIndex);
    return () => {
      this.events.off("displayedLineChange", handler);
    };
  }

  /** 最近一次 decision 玩家所选的 value（0 = 未做选择/默认分支） */
  getDecisionSelectValue(): number {
    return this.decisionSelectValue;
  }

  getLogPosition(): RuntimeLogPosition {
    return {
      lineIndex: this.displayedLineIndex,
      selections: this.choiceHistory.map((selection) => ({ ...selection })),
    };
  }

  getAutoPlayState(): AutoPlayState {
    return {
      buttonSpeedLevel: this.buttonSpeedLevel,
      mode: this.autoPlayMode,
      quickSpeedLevel: this.quickSpeedLevel,
    };
  }

  /** theater 期间模式归 theater 所有，UI 据此禁用模式与速度控件 */
  isTheaterMode(): boolean {
    return this.theaterMode;
  }

  /** Web 调试适配：注入后 decision 不等面板点击，直接按返回的下标选择 */
  setDecisionPolicy(policy: DecisionPolicy | null): void {
    // 跳转期间策略归跳转所有，外部注入的先存着，等跳转收尾再接管
    if (this.lineSeek) this.lineSeek.previousPolicy = policy;
    else this.decisionPolicy = policy;
  }

  /**
   * Web 调试适配（无原生对应）：编排一次「快速播放直达目标行」。三种收尾
   * 并推送终态：到达（displayedLineIndex 赋值点逐行检测）→ reached；播完
   * （隐式 endtip）或出错 → missed；使用者自己切走播放模式 → aborted。
   * 脚本自身的模式切换（[theater] 等）不算干预，见 applyScriptAutoPlayMode。
   * 返回取消函数：只静默摘掉策略，不推终态，UI 自行处理。
   */
  seekToLine(
    target: number,
    choices: ReadonlyMap<number, number>,
    onUpdate: (update: LineSeekUpdate) => void,
  ): () => void {
    if (this.destroyed || this.state === "finished" || this.state === "error") {
      onUpdate({
        phase: "missed",
        reason: this.state === "error" ? "error" : "finished",
        target,
      });
      return () => {};
    }

    this.closeLineSeek();
    this.lineSeek = {
      choices,
      onUpdate: (update) => {
        try {
          onUpdate(update);
        } catch (error) {
          this.onWarning?.({
            cursor: this.cursor,
            detail:
              error instanceof Error
                ? error.message
                : "line seek listener error",
            type: "error",
          });
        }
      },
      previousPolicy: this.decisionPolicy,
      target,
    };
    this.decisionPolicy = (decision) => choices.get(decision.decisionId) ?? 0;
    this.enterQuickSeekMode();
    this.lineSeek.onUpdate({ phase: "seeking", target });
    return () => this.closeLineSeek();
  }

  /** 收尾进行中的行号跳转；带 update 时推送终态（onUpdate 已带异常护栏） */
  private closeLineSeek(update?: LineSeekUpdate): void {
    const seek = this.lineSeek;
    if (!seek) return;
    this.lineSeek = null;
    this.decisionPolicy = seek.previousPolicy;
    if (update) seek.onUpdate(update);
  }

  /** 跳转的推进档位：quick_play 最高档 */
  private enterQuickSeekMode(): void {
    // 先切模式再设速度：setAutoPlaySpeedLevel 按当前模式写入档位，
    // default 模式下 quick 的 4 档会被钳到按钮自动的 3 档上限
    this.applyAutoPlayMode("quick_play");
    this.setAutoPlaySpeedLevel(QUICK_AUTO_SPEEDS.length - 1);
  }

  /** 播放走到终态时若仍有跳转在进行，按 missed 收尾 */
  private finishLineSeekMissed(reason: "finished" | "error"): void {
    const seek = this.lineSeek;
    if (seek)
      this.closeLineSeek({ phase: "missed", reason, target: seek.target });
  }

  /**
   * 公开入口 = 使用者发起的模式切换（UI 按钮、点击推进）。只有这条路径上
   * 切离 quick_play 才算人工干预、中止进行中的跳转；脚本命令引起的切换走
   * applyScriptAutoPlayMode，不会被误判。
   *
   * theater 期间原生隐藏 HUD，玩家切不了模式，模式归 theater 所有直到 exit
   * 按缓存恢复。Web 的公开入口（模式按钮、Log All、调试页摘跳转）还在，这里
   * 一律落到 theater 自己的 button_auto：切成手动的话点击被吞、自动点击也
   * 不再调度，剧情就卡死了。
   */
  setAutoPlayMode(requested: AutoPlayMode): void {
    if (this.destroyed || this.state === "finished" || this.state === "error")
      return;
    const mode = this.theaterMode ? "button_auto" : requested;
    if (this.autoPlayMode === mode) return;

    // 模式以本次调用为准，不再改
    if (mode !== "quick_play" && this.lineSeek)
      this.closeLineSeek({
        phase: "aborted",
        target: this.lineSeek.target,
      });

    this.applyAutoPlayMode(mode);
  }

  /** 写入模式并重排自动点击；不含跳转的人工干预判定 */
  private applyAutoPlayMode(mode: AutoPlayMode): void {
    if (this.destroyed || this.state === "finished" || this.state === "error")
      return;
    if (this.autoPlayMode === mode) return;

    this.autoPlayMode = mode;
    this.cancelAutoClick();

    if (mode === "quick_play" && this.state === "waiting_input") {
      void this.advanceFromClick();
      return;
    }
    if (mode !== "default" && this.currentTypingComplete)
      this.scheduleAutoClick(this.currentRawMessageLength);
  }

  /**
   * 脚本命令（[theater]、无效 decision）引起的模式切换：不是人工干预，不
   * 中止跳转。但跳转全靠 quick_play 的自动点击推进，被切走就再也推不动
   * （[theater(mode=false)] 的缓存恢复还会把 quick_play 映射回 default），
   * 所以跳转期间由跳转夺回模式所有权——这是 Web 调试适配，非原生行为。
   */
  private applyScriptAutoPlayMode(mode: AutoPlayMode): void {
    this.applyAutoPlayMode(mode);
    if (this.lineSeek && this.autoPlayMode !== "quick_play")
      this.enterQuickSeekMode();
  }

  setAutoPlaySpeedLevel(level: number): void {
    const normalized = Math.max(0, Math.trunc(level));
    if (this.autoPlayMode === "quick_play")
      this.quickSpeedLevel = Math.min(normalized, QUICK_AUTO_SPEEDS.length - 1);
    else
      this.buttonSpeedLevel = Math.min(
        normalized,
        BUTTON_AUTO_SPEEDS.length - 1,
      );

    this.cancelAutoClick();
    if (this.autoPlayMode !== "default" && this.currentTypingComplete)
      this.scheduleAutoClick(this.currentRawMessageLength);
  }

  canSkipNode(): boolean {
    const running =
      this.state !== "idle" &&
      this.state !== "error" &&
      this.state !== "finished";
    const hasSkipAnchor =
      this.skipToIndex >= 0 || this.skipNodeLabels.length > 0;
    // SkipToThis is forward-only, so once playback has crossed the anchor
    // `skipNode` returns without moving: report that as "cannot skip" instead
    // of leaving an enabled button that does nothing.
    const skipToPending =
      this.skipToIndex < 0 || this.cursor <= this.skipToIndex;
    // Native port: AVGController._UpdateSkipStatus (2.7.81 VA 0x183F934E0)
    // drives the skip button's visibility with get_isSkippable --
    // isRunning && story.isSkippable && AVGStoryCache
    // .CheckIfSkippableInCurMode (0x183FCD770). The last term is nofirstskip's
    // actual enforcement: on a first read inside a locked segment the button
    // is gone, so neither the trailing skip anchor can be dequeued into a
    // whole-story stop nor a SkipToThis jump fired from inside the segment
    // (training_act50side_01_b: nofirstskip L2 ... SkipToThis L33 -- SkipStory
    // never checks the mode on its SkipToThis branch, only this gate does).
    // A header is_skippable=false story (tutorials) hides the button for
    // everyone.
    const storySkippable = this.context.storyMetadata?.isSkippable ?? true;
    const skippableInCurMode =
      this.currentSkipMode !== "nofirstskip" || !this.firstRead;
    // This widget exposes a segment-skip button rather than native's whole
    // story StopStory action. Keep it disabled when the script has no remaining
    // SkipToThis/skipnode destination at all.
    return (
      running &&
      hasSkipAnchor &&
      skipToPending &&
      storySkippable &&
      skippableInCurMode
    );
  }

  async start(): Promise<void> {
    if (this.destroyed) return;
    if (this.state !== "idle") return;

    // The normal AVG command loop is not entered for VIDEO_ONLY stories. Their
    // media is owned by the separate entry-video flow in the game host.
    if (this.context.storyMetadata?.isVideoOnly) {
      this.state = "finished";
      this.finishLineSeekMissed("finished");
      return;
    }

    this.state = "running";
    await this.processLoop();
  }

  async advance(): Promise<void> {
    if (this.destroyed) return;

    if (this.state === "idle") {
      await this.start();
      return;
    }

    // Native port: Torappu.AVG.AVGController.OnClickPress (2.7.61 VA
    // 0x183E15900) resets the auto play mode to DEFAULT on every non-theater
    // press, with no regard for what the command loop is currently blocked
    // on -- a press landing inside a blocking `delay` still flips quick_play's
    // animateRatio back to 1 so delays enqueued afterwards keep real-time
    // pacing. The press never interrupts the wait itself (OnClickPress does
    // not touch the blocking executors), which the waiting_input gate below
    // preserves: the player has no pause semantics and advance() stays a
    // no-op for the story flow. Theater presses return before this side
    // effect (native isTheaterMode early-out at 0x183E159B2).
    if (this.theaterMode) return;

    this.setAutoPlayMode("default");

    if (this.state !== "waiting_input") return;

    await this.advanceFromClick();
  }

  private async advanceFromClick(): Promise<void> {
    if (this.state !== "waiting_input") return;

    if (this.dialogPanel.finishTypingOnClick()) return;
    if (this.renderer.finishTextTyping()) {
      this.onTypingComplete();
      return;
    }

    this.cancelAutoClick();
    this.dialogPanel.finishCommand();
    const inputEffect = this.pendingInputEffect;
    this.pendingInputEffect = null;
    await inputEffect?.();
    this.state = "running";
    await this.processLoop();
  }

  async skipNode(): Promise<void> {
    if (this.destroyed || !this.canSkipNode()) return;

    // Native port: Torappu.AVG.AVGController.OnSkipBtnClicked (2.7.61
    // 0x183e16ee0) drops the skip click entirely while autoPlayMode ==
    // QUICK_PLAY. The brief-confirm panel it shows otherwise is a native-only
    // UI that this widget intentionally omits.
    if (this.autoPlayMode === "quick_play") return;

    const hadActiveProcessLoop = this.processing;
    const activeProcessCompletion = this.processingCompletion;
    // 入口处取样：此时命令循环若挂在 renderer.showDecision 上，skip 要负责
    // 替它结算（见下方 settleDecision）。
    const pendingDecision = this.pendingDecision;
    let shouldResume = false;

    // m_executeIndex points at the command currently being waited on while our
    // cursor already points at the next command, hence cursor <= anchorIndex is
    // the native m_executeIndex < m_skipToIndex forward-only test.
    if (this.skipToIndex >= 0 && this.cursor <= this.skipToIndex) {
      this.cursor = this.skipToIndex + 1;
      shouldResume = true;
      // Native port: Torappu.AVG.AVGController.SkipStory's shared UI tail runs
      // after the SkipToThis jump and resets set_autoPlayMode(DEFAULT) plus
      // stops the auto coroutine (2.7.71 VA 0x183ec718d / 0x183ec71de), so auto
      // playback never continues past the anchor. Web adaptation: only the
      // real jump resets; native also runs this tail for an already-crossed
      // anchor (a no-op jump), which canSkipNode() precludes here.
      //
      // The same tail then zeroes the whole m_storyCache (0x183ec7205), theater
      // flag included, so OnClickPress stops swallowing clicks; leaving
      // theaterMode set would strand the story with no auto click and no
      // manual advance. The pre-theater auto state (autoPlayModeCache /
      // m_needResumeAutoStatus) lives on AVGController outside the cache and
      // survives: theaterAutoPlayCache is kept for a later [theater(mode=false)].
      // Web order: the flag goes first, since setAutoPlayMode pins an active
      // theater to button_auto.
      this.theaterMode = false;
      this.setAutoPlayMode("default");
      // 挂起的 decision 结算后会把进面板前缓存的模式还回去（web 的等待期
      // 降级），那样 auto 又会越过锚点继续：还原目标一并改成 default。
      if (pendingDecision) pendingDecision.autoPlayRestore = "default";
      // Native tail zeroes the whole m_storyCache, so the skipnode queue and
      // curSkipMode go with it (2.7.81 SkipStory 0x183F8EB80): later skipnode
      // executors read EMPTY -- CAN_SKIP -- instead of a stale unconsumed
      // label stranded behind the jump.
      this.skipNodeQueueIndex = this.skipNodeLabels.length;
      this.currentSkipMode = "skip";
    } else if (this.skipToIndex >= 0) {
      // SkipToThis is forward-only. Native does not fall back to skipnode or
      // StopStory after playback has already crossed the anchor.
      return;
    } else if (this.skipToIndex < 0) {
      const nextLabel = this.skipNodeLabels[this.skipNodeQueueIndex];
      if (nextLabel) {
        this.skipNodeQueueIndex += 1;
        this.currentSkipMode = nextLabel.mode;
      }

      // Native port: Torappu.AVG.AVGController.get_isSkippable (2.7.61
      // 0x183e1f7a0): isRunning && story.isSkippable &&
      // AVGStoryCache.CheckIfSkippableInCurMode (0x183e5f250). story.isSkippable
      // is the HEADER `is_skippable` flag -- since 2.7.61 the tutorial gate is
      // expressed through it (header defaults it to !is_tutorial during
      // parsing, see parser.ts) instead of a direct !isTutorial check.
      // CheckIfSkippableInCurMode: a nofirstskip anchor only blocks first
      // reads.
      const storySkippable = this.context.storyMetadata?.isSkippable ?? true;
      const isSkippable =
        storySkippable &&
        (this.currentSkipMode !== "nofirstskip" || !this.firstRead);
      if (nextLabel && !isSkippable) {
        // Native stores the anchor index and the coroutine's leading increment
        // resumes at the following command.
        this.cursor = nextLabel.lineIndex + 1;
        shouldResume = true;
      } else {
        this.cursor = this.lines.length;
        // Skipping past the last anchor ends the story, and the native reset
        // path tears a live show-item slot down on the way out.
        this.resetItemSlot();
      }
    }

    this.pendingInputEffect = null;
    // Native port: AVGController.SkipStory (0x183e1a150) reaches
    // _ResetComponentsOnSkip (0x183e1d3f0) only on the two paths that keep
    // playing -- jumping to a SkipToThis anchor, and jumping to the next
    // skipnode label when get_isSkippable() is false. When the story *is*
    // skippable in the current mode (or no skip node is left) it takes
    // StopStory("Skipped") and returns without resetting a single component, so
    // a skip that ends the story leaves the screen exactly as it was.
    // `shouldResume` is that same fork.
    if (shouldResume) {
      // Native SkipStory force-ends the blocking executors before resetting
      // the components that opt in to a skip reset.
      this.dialogPanel.forceCommandEnd();
      // Native port: both executors on AVGCharacterCutinPanel reset on skip --
      // ShouldResetOnSkip() @ 0x183e492b0 returns true and _Reset @ 0x183e4af80
      // empties the slot pool / _slots before resetting the interlude
      // controller, so a skipped node must not leave cutin slots behind.
      await this.renderer.clearInterludes();
      await this.renderer.clearCharacterCutin();
      await this.renderer.clearSpellStickers();
      // Native: SubtitlePanel.ShouldResetOnSkip() is true, so a skip resets the
      // panel through OnReset -- alpha to 0 immediately (no tween) plus a
      // typewriter reset. A stale subtitle must not survive the skip.
      await this.renderer.clearSubtitle(0);
      await this.stickerPanel.reset();
    }

    this.dialogPanel.stopTypingSilently();
    this.cancelTextTyping();
    if (shouldResume) {
      this.state = "running";
    } else if (!hadActiveProcessLoop) {
      // Story ended by skip with no loop alive to reach finishPlayback();
      // apply the same end-of-story audio reset it performs.
      this.audio.resetAudio();
      this.state = "finished";
      this.finishLineSeekMissed("finished");
    }

    // Establish the destination state before releasing a blocking executor.
    // Its existing processLoop owns continuation; starting another loop would
    // race it and can leave state="running" with no loop alive.
    this.interruptPendingWait();
    // Native port: SkipStory（2.7.81 VA 0x183F8EB80）的两条继续播放路径都
    // 先对 m_blockingExecutors 逐个 ForceEnd() 再 Clear()；
    // DoExecuteCommands（MoveNext 0x183FA6AD0）只在该列表非空时 yield，
    // 清空后就从改写过的 m_executeIndex 往下走——decision 的 executor 也
    // 在这个列表里，所以循环不会吊死。DecisionPanel 自身却不收尾：
    // ForceCommandEnd（0x183FE0410）除 xLua hotfix 分发外是空函数，
    // ShouldResetOnSkip（0x183FE09B0）为 false，_ResetComponentsOnSkip 不调
    // 它的 OnReset，面板留在屏幕上，m_decisionExecutors /
    // m_currentDecisionCommand 也留着，等迟到的点击走 OnDecisionSelected。
    // Web 适配：关掉面板并按「未点击」结算（{optionIndex:-1, value:0}）。
    // 闸门值与 native 一致——_ExecuteDecision 已把 decisionValue 置 0、skip
    // 不碰它——差别只在 native 玩家还得去点那块残留面板。不结算的话
    // processLoop 永远吊在 showDecision 上，state=running 却无人推进。
    // 只结算入口取样到的那个：skip 中途 await 时玩家可能已点掉它，循环
    // 甚至可能已走到下一个 decision。
    if (pendingDecision && this.pendingDecision === pendingDecision)
      this.renderer.settleDecision();
    if (hadActiveProcessLoop) await activeProcessCompletion;
    else if (shouldResume) await this.processLoop();
  }

  /**
   * Native port: `AVGController.get_animateRatio` resolves every gear via
   * `CollectionExtensions.SafeGet(table, level, default: _dialogDefaultSpeed)`
   * (2.7.71 VA 0x183ECBA00) — an out-of-range level lands on the default
   * speed table (animateRatio 1), never on quick gear 0 (ratio 0, which would
   * keep zeroing delays). Button-auto keeps its gear-0 fallback: both tables
   * agree on animateRatio and typing there.
   */
  private getCurrentSpeed(): AutoSpeed {
    if (this.autoPlayMode === "button_auto")
      return (
        BUTTON_AUTO_SPEEDS[this.buttonSpeedLevel] ?? BUTTON_AUTO_SPEEDS[0]!
      );
    if (this.autoPlayMode === "quick_play")
      return QUICK_AUTO_SPEEDS[this.quickSpeedLevel] ?? this.defaultSpeed;
    return this.defaultSpeed;
  }

  /**
   * Native port: Torappu.AVG.AVGUtils.CalculateFadetime, adapted from seconds
   * to milliseconds. It applies animateRatio * fadetime.
   *
   * Only panels implementing IFadeTimeRatio route through it. AVGImagePanel does
   * (background / image / imagerotate); its tween executors bypass it, and the
   * whole LargeBackgroundPanel family (largebg / verticalbg / gridbg /
   * largeimgtween) stays outside. AVGBlockerPanel implements it too
   * (2.7.61 `CalculateFadetime` VA 0x183e2f6d0, inlined into `_ExecuteBlocker`
   * at 0x183e3040e), so `blocker` also routes through this helper.
   */
  private calculateFadeMs(seconds: unknown, fallback = 0): number {
    return Math.max(
      0,
      toNumber(seconds, fallback) * this.getCurrentSpeed().animateRatio * 1000,
    );
  }

  private cancelAutoClick(): void {
    this.autoClickGeneration += 1;
  }

  private scheduleAutoClick(messageLength: number): void {
    this.cancelAutoClick();
    if (this.autoPlayMode === "default") return;
    const generation = this.autoClickGeneration;
    const speed = this.getCurrentSpeed();
    const delayMs =
      (speed.autoWaitBaseTime + messageLength * speed.autoWaitTimePerText) *
      1000;
    void this.sleep(delayMs).then(() => {
      if (
        this.destroyed ||
        generation !== this.autoClickGeneration ||
        this.autoPlayMode === "default" ||
        this.state !== "waiting_input"
      ) {
        return;
      }
      void this.advanceFromClick();
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.lineSeek = null;
    this.dialogPanel.destroy();
    this.cancelTextTyping();
    this.interruptPendingWait();
    this.pendingInputEffect = null;
    // 销毁后不该再有推送落到 UI 上
    this.events.all.clear();
  }

  /**
   * Native port: `Torappu.AVG.AVGShowItemPanel.OnReset` → `_Reset`
   * (GameAssembly 2.7.61 @ 0x183E5C1B0). Story end and reset both funnel
   * through the native reset path: a live `_slotInUse` gameObject is
   * destroyed without delay and the reference cleared, so the item image and
   * its black backdrop never outlive the story. Native also runs this after a
   * skip cut the story short, hence the skipNode call site.
   */
  private resetItemSlot(): void {
    // Native `_Reset` only acts while `_slotInUse` is non-null; after a
    // hideitem (or a first reset) the slot is already gone.
    if (!this.itemSlotInUse) return;
    this.itemSlotInUse = false;
    void this.renderer.clearItems(0);
  }

  /**
   * Native port: AVGController.MoveNext's end-of-story path (the bounds-check
   * exit at 2.7.81 VA 0x183fa6d3b). processLoop also reuses it for the web-only
   * guard on an out-of-range warp target, where native would throw instead.
   */
  private finishPlayback(): void {
    this.renderer.clearAnimTexts();
    this.renderer.clearAvgDisplays();
    // Native end-of-story reset destroys a lingering show-item slot
    // (AVGShowItemPanel._Reset) instead of leaving the item on screen.
    this.resetItemSlot();
    // Native port: AVGController.OnStoryEnd (2791 VA 0x18416B9C0) calls every
    // component's OnReset once no new story is running, and
    // CommonExecutors.OnReset -> _ResetAudio (0x1841C6200) stops every SOUND
    // channel playsound started and stopsound did not explicitly stop, so an
    // unterminated loop ambience cannot outlive the story. MUSIC is global in
    // native and deliberately untouched here.
    this.audio.resetAudio();
    this.state = "finished";
    this.finishLineSeekMissed("finished");
  }

  private async processLoop(): Promise<void> {
    if (this.processing) return;

    this.processing = true;
    this.processingCompletion = new Promise<void>((resolve) => {
      this.resolveProcessingCompletion = resolve;
    });

    try {
      while (!this.destroyed) {
        // Native port: Torappu.AVG.AVGController.MoveNext bounds-checks the
        // incremented index BEFORE consulting ICommandFlowController
        // (bounds → abort → GotoCommandIndex → fetch; 2781 VA 0x183fa6d3b →
        // 0x183fa6da4 → 0x183fa6ddd): a pending warp cursor only replaces an
        // in-range index, so a warp on the last line would be dropped by the
        // story end instead of jumping. Our cursor already points at the next
        // line to fetch, which folds the increment+bounds pair into the check
        // below. The overwrite stays independent of the decision predicate
        // gate further down (native: flow-controller vs predicator are two
        // separate MoveNext concerns).
        if (this.cursor >= this.lines.length) {
          this.finishPlayback();
          return;
        }

        if (this.gotoIndex >= 0) {
          this.cursor = this.gotoIndex;
          this.gotoIndex = -1;
          // Web adaptation: native would fetch commands[count] and throw
          // ArgumentOutOfRangeException. parseScript always ends a script
          // with an endtip (AVGParser._AppendEndTip), so a label is never the
          // last line and this branch is unreachable today; it is only a
          // defensive guard that finishes the story instead of throwing.
          if (this.cursor >= this.lines.length) {
            this.finishPlayback();
            return;
          }
        }

        const line = this.lines[this.cursor];
        this.cursor += 1;

        // 闸门语义与 Log All 的符号分析共用 log/semantics，避免两侧漂移
        if (
          !passesGate(
            {
              references: this.decisionReferences,
              selectedValue: this.decisionSelectValue,
            },
            line,
          )
        ) {
          continue;
        }

        const result =
          line.kind === "command"
            ? await this.executeCommand(line)
            : this.dialogPanel.executeTextLine(line);
        if (result === "wait_input") {
          this.state = "waiting_input";
          return;
        }
      }
    } catch (error) {
      this.state = "error";
      this.finishLineSeekMissed("error");
      const detail =
        error instanceof Error ? error.message : "unknown runtime error";
      this.onWarning?.({ cursor: this.cursor, detail, type: "error" });
    } finally {
      this.processing = false;
      this.resolveProcessingCompletion?.();
      this.resolveProcessingCompletion = null;
      this.processingCompletion = null;
    }
  }

  private arg(args: StoryCommandArgs, key: string): unknown {
    if (Object.prototype.hasOwnProperty.call(args, key)) return args[key];
    const matched = Object.keys(args).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    );
    return matched === undefined ? undefined : args[matched];
  }

  private exactArg(args: StoryCommandArgs, key: string): unknown {
    return exactArg(args, key);
  }

  private warn(
    type: RuntimeWarning["type"],
    detail?: string,
    lineNumber?: number,
    command?: string,
  ): void {
    this.onWarning?.({
      ...(command === undefined ? {} : { command }),
      cursor: this.cursor,
      detail,
      ...(lineNumber === undefined ? {} : { lineNumber }),
      type,
    });
  }

  /**
   * Web adaptation, not native behavior: native passes the raw key straight
   * into `ResourceRouter.GetBackgroundPath` (`AVG/Backgrounds/<key>`). The
   * frontend trims and lowercases because the web asset router is
   * case-sensitive while game data keys are lowercase-only, so this only
   * ever repairs whitespace or capitalization typos.
   */
  private resolveImageKey(key: string): string | null {
    const normalized = key.trim().toLowerCase();
    if (!normalized) return null;
    return normalized;
  }

  private hasAudioKey(key: string): boolean {
    return Boolean(resolveStoryAudioByKey(key, this.context.audioVariables));
  }

  private interruptPendingWait(): void {
    const wait = this.pendingWait;
    this.pendingWait = null;
    wait?.interrupt?.();
    wait?.resolve();
  }

  private async waitInterruptiblePromise(
    task: Promise<void>,
    interrupt?: () => void,
  ): Promise<boolean> {
    const id = ++this.pendingWaitId;
    const interrupted = new Promise<boolean>((resolve) => {
      this.pendingWait = {
        id,
        interrupt,
        resolve: () => resolve(true),
      };
    });

    const completed = await Promise.race([task.then(() => false), interrupted]);

    if (this.pendingWait?.id === id) this.pendingWait = null;

    return completed;
  }

  private async waitInterruptible(ms: number): Promise<boolean> {
    return this.waitInterruptiblePromise(this.sleep(Math.max(0, ms)));
  }

  private resolveCharacterName(ref: string): CharacterRefResolution {
    return resolveCharacterRef(this.context.linkMap, ref);
  }

  /**
   * The ref makes native `SetImage` throw IndexOutOfRangeException, which
   * nothing catches before the `DoExecuteCommands` coroutine dies: native
   * stops running the story at this command, with the slot still showing its
   * previous art. Web adaptation: warn, leave the slot as it is and skip the
   * rest of the command, but keep playing (as with verticalbg's single tile).
   */
  private warnNativeSlotThrows(
    ref: string,
    line: ParsedCommandLine,
  ): "continue" {
    this.warn(
      "invalid_parameter",
      `character ${ref} is out of its sprite hub's bounds; native SetImage throws and stops the story here`,
      line.lineNumber,
      line.command,
    );
    return "continue";
  }

  private executeCommand(line: ParsedCommandLine): Promise<CommandResult> {
    // HEADER remains in Story.commands but has no registered executor.
    if (line.command === "header") return Promise.resolve("continue");
    const executors = this.commandRegistry.get(line.command);
    if (executors === null) {
      this.warn("unknown_command", line.command);
      return Promise.resolve("continue");
    }
    if (executors.length === 1) {
      const result = executors[0]!(line);
      return result instanceof Promise ? result : Promise.resolve(result);
    }
    return Promise.all(executors.map((executor) => executor(line))).then(
      (results) => (results.includes("wait_input") ? "wait_input" : "continue"),
    );
  }

  private async executeBuiltinCommand(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
    const args = line.args;

    switch (line.command) {
      case "delay": {
        // Native port: Torappu.AVG.CommonExecutors._ExecuteDelayCommand.
        // Only `time` is read and is scaled by animateRatio.
        const durationMs = Math.max(
          0,
          toNumber(this.exactArg(args, "time"), 0) *
            this.getCurrentSpeed().animateRatio *
            1000,
        );
        this.state = "waiting_timer";
        await this.waitInterruptible(durationMs);
        this.state = "running";
        return "continue";
      }

      case "video": {
        // Native port: Torappu.AVG.AVGVideoPanel._ExecuteVideo / _PlayVideo
        // (2.7.61: still the legacy bool executor, consumed by the new
        // ExecutorComponent.Execute(Command, Action) adapter). `url` takes
        // priority; an http(s) value is emitted verbatim like native
        // (0x183E68AAD), while any other value goes through the same CDN
        // normalization as `res` — a web delivery adaptation, native never
        // converts `url`.
        const url = toString(this.exactArg(args, "url"));
        const res = toString(this.exactArg(args, "res"));
        if (!url && !res) {
          // Native: DLog.LogError("[AVG.Video] No url or res!") + return
          // false → ExecutorComponent.Execute finishes the command
          // synchronously in the same frame (0x183E45C12); no blocking state
          // is ever entered.
          this.warn("invalid_parameter", "video: no url or res");
          return "continue";
        }

        const resolved = url
          ? resolveStoryVideoByKey(url)
          : resolveStoryVideoByKey(res);
        if (!resolved) {
          this.warn("missing_asset", `video: ${url || res}`);
          return "continue";
        }

        // Native port: VideoManager.CheckVideoExist (0x183B2FDB0) gates the
        // `res` branch before playback; a miss raises
        // Toast(NO_VIDEO_MESSAGE) and _PlayVideo returns false so the command
        // ends in the same frame (0x183E689FC) without blocking. The `url`
        // branch has no such check in native. Web adaptation: the existence
        // answer is HEAD-probed while the context loads
        // (`findMissingVideoUrls`), so this stays a synchronous lookup like
        // the native RawResManager one; onWarning is the Toast equivalent.
        if (!url && this.context.missingVideoUrls?.has(resolved)) {
          this.warn("missing_asset", `video: ${res}`);
          return "continue";
        }

        this.state = "waiting_video";
        const interrupted = await this.waitInterruptiblePromise(
          this.renderer.playVideo(resolved),
          () => this.renderer.stopVideo(),
        );
        // Native finishes on PLAYEND/ERROR at the END of the CURRENT frame
        // (InvokeEndOfFrame → WaitForEndOfFrame; 2.7.61 token-verified — the
        // IDA shared-body symbol InvokeNextFrame is an ICF-fold alias).
        // `sleep(0)` is the macro-task web approximation. Force-end is
        // released by CommandExecutorWrapper.ForceEnd synchronously in-frame
        // and deliberately bypasses this yield.
        if (!interrupted) await this.sleep(0);
        this.state = "running";
        return "continue";
      }

      case "skipnode": {
        const label = this.skipNodeLabels[this.skipNodeQueueIndex];
        this.skipNodeQueueIndex += 1;
        this.currentSkipMode = label?.mode ?? "skip";
        return "continue";
      }

      case "skiptothis": {
        // Native port: Torappu.AVG.AVGController._PreprocessCommands. This is a
        // preprocess-only command with no executor, so normal playback advances
        return "continue";
      }

      case "label": {
        // Native port: Torappu.AVG.AVGGotoLabel._ExecuteLabel. The native
        // executor is an empty hotfix shell that always returns false: the
        // label's whole effect is the preprocess registration done by
        // preprocessLabelMap, so at run time it is a silent no-op that never
        // blocks and never warns.
        return "continue";
      }

      case "warp": {
        // Native port: Torappu.AVG.AVGGotoLabel._ExecuteGoto. A missing
        // `name` key or a labelMap miss is a silent no-op -- no warning, no
        // exception (every current `[warp(name="chiyu01")]` in the corpus
        // takes the miss path because no label defines it). On a hit the
        // one-shot goto cursor becomes the bare label index + 1, i.e. the line
        // right after the label. Native applies the +1 here too, and MoveNext
        // fetches the consumed index as-is, the same as processLoop.
        const name = this.exactArg(args, "name");
        if (name === undefined) return "continue";
        const target = this.labelMap.get(toString(name));
        if (target === undefined) return "continue";
        this.gotoIndex = target + 1;
        return "continue";
      }

      case "gotostage": {
        // Native port: Torappu.AVG.AVGGotoStagePanel._ExecuteGotoStage. Its
        // only side effect is a client UI route
        // (UIRouteUtil.RouteToStage -> the target stage's selection/preview
        // page); it never ends the story, blocks the queue, or touches the
        // command index, and an empty/unresolvable target is a silent no-op.
        // A web story widget has no game shell to route, so the navigation is
        // intentionally omitted and the `target` param goes unread: the
        // command just keeps playback moving.
        return "continue";
      }

      case "background": {
        // Native port: Torappu.AVG.AVGImagePanel._ExecuteImage as registered by
        // BackgroundPanel. This covers its clear branch (empty or unresolvable
        // `image` key) and the animateRatio-scaled cross-fade; a texture load
        // failure is cleared inside the renderer (see setBackground).
        const image = toString(this.exactArg(args, "image"));
        const fadeMs = this.calculateFadeMs(this.exactArg(args, "fadetime"));
        const block =
          fadeMs > 0 && toBoolean(this.exactArg(args, "block"), false);
        if (!image) {
          await this.renderer.clearBackground(fadeMs, block);
          return "continue";
        }

        const resolved = this.resolveImageKey(image);
        if (!resolved) {
          this.warn("missing_asset", `background: ${image}`);
          await this.renderer.clearBackground(fadeMs, block);
          return "continue";
        }

        // `_LoadImage` multiplies the SetNativeSize rect by the `width`/
        // `height` params (GetOrDefault<float>(..., 1.0); the mulss at
        // 0x183e587b0/0x183e587b4 in build 2761) before screenadapt reads it.
        await this.renderer.setBackground(resolved, {
          block,
          fadeMs,
          height: toNumber(this.exactArg(args, "height"), 1),
          scaleX: toNumber(this.exactArg(args, "xScale"), 1),
          scaleY: toNumber(this.exactArg(args, "yScale"), 1),
          screenAdapt: this.parseScreenAdapt(
            this.exactArg(args, "screenadapt"),
          ),
          tiled: toBoolean(this.exactArg(args, "tiled"), false),
          width: toNumber(this.exactArg(args, "width"), 1),
          x: toNumber(this.exactArg(args, "x"), 0),
          y: toNumber(this.exactArg(args, "y"), 0),
        });
        return "continue";
      }

      case "backgroundtween": {
        // Native port: Torappu.AVG.AVGImagePanel._ExecuteImageTween (2.7.71
        // VA 0x183f055b0). Duration bypasses CalculateFadetime/animateRatio
        // entirely and only takes effect while > 0 — <= 0 completes both
        // tweens instantly (TweenExtensions.Complete). `ease` is read with
        // GetEnum<Ease>(param, "ease", default 1 = Linear) and `loop` feeds
        // SetLoops(2*!loop - 1): true → infinite Restart loop.
        const duration = this.exactArg(args, "duration");
        const block =
          toNumber(duration, 0) > 0 &&
          toBoolean(this.exactArg(args, "block"), false);
        const loop = toBoolean(this.exactArg(args, "loop"), false);
        if (block && loop) {
          // Native logs this (sic) DLog.LogError and still starts the loop,
          // whose OnComplete(FinishCommand) then never fires, so the story
          // hangs. The warning keeps the native typo "intinity lop" on
          // purpose, but block is dropped below so playback continues: an
          // awaited renderer call that never settles cannot be interrupted
          // here (skipNode would wait on it forever).
          this.warn(
            "invalid_parameter",
            "Loop and block both true when tween background! Will cause intinity lop!",
            line.lineNumber,
            line.command,
          );
        }

        await this.renderer.setBackgroundTween({
          block: block && !loop,
          durationMs: Math.max(0, toNumber(duration, 0) * 1000),
          ease: toString(this.exactArg(args, "ease"), "Linear"),
          loop,
          xFrom: toOptionalNumber(this.exactArg(args, "xFrom")),
          xScaleFrom: toOptionalNumber(this.exactArg(args, "xScaleFrom")),
          xScaleTo: toOptionalNumber(this.exactArg(args, "xScaleTo")),
          xTo: toOptionalNumber(this.exactArg(args, "xTo")),
          yFrom: toOptionalNumber(this.exactArg(args, "yFrom")),
          yScaleFrom: toOptionalNumber(this.exactArg(args, "yScaleFrom")),
          yScaleTo: toOptionalNumber(this.exactArg(args, "yScaleTo")),
          yTo: toOptionalNumber(this.exactArg(args, "yTo")),
        });
        return "continue";
      }

      case "gridbg": {
        // Native port: Torappu.AVG.LargeBackgroundPanel._ExecuteGridBG. This
        // validates a 2×2 tile set and keeps fadetime unscaled.
        const imageGroup = toString(this.exactArg(args, "imagegroup"));
        const cgGroup = toString(this.exactArg(args, "cggroup"));
        const groupSelection = resolveGroupedAssetSelection(
          imageGroup,
          cgGroup,
        );
        // Native always reads `initposmode` (default "default", 2.7.61:
        // 0x183e76959) and unconditionally rewrites `_initOffset.localPosition`
        // after assembling the puzzle (0x183e77451-0x183e775ce): a key miss
        // writes Vector2.zero, the same offset the "center" mode produces.
        const initPositionModeArg = toString(
          this.exactArg(args, "initposmode"),
          "default",
        );
        const initPositionMode =
          initPositionModeArg === "default" ||
          initPositionModeArg === "upperleft" ||
          initPositionModeArg === "lowercenter" ||
          initPositionModeArg === "center"
            ? initPositionModeArg
            : "center";
        const fadeMs = Math.max(
          0,
          toNumber(this.exactArg(args, "fadetime"), 0) * 1000,
        );
        const block =
          fadeMs > 0 && toBoolean(this.exactArg(args, "block"), false);

        if (!groupSelection) {
          await this.renderer.clearGridBackground(fadeMs, block);
          return "continue";
        }

        const imageKeys = groupSelection.groupValue
          .split("/")
          .map((item) => this.resolveImageKey(item))
          .filter((key): key is string => key !== null);
        const solidWidths = parseNumberSequence(
          this.exactArg(args, "solidwidth"),
        ).slice(0, 2);
        const solidHeights = parseNumberSequence(
          this.exactArg(args, "solidheight"),
        ).slice(0, 2);

        if (imageKeys.length === 0) {
          this.warn("parse", "gridbg imagegroup is empty");
          // Native treats every empty tile name as a fatal parse error and
          // calls `_ResetPanel()` (2.7.61: 0x183e77675), which drops the
          // current picture instead of keeping it around.
          await this.renderer.clearGridBackground(0);
          return "continue";
        }

        if (
          imageKeys.length !== 4 ||
          solidWidths.length !== 2 ||
          solidHeights.length !== 2
        ) {
          this.warn(
            "parse",
            `gridbg expects ${imageKeys.length} widths/heights, got ${solidWidths.length}/${solidHeights.length}`,
          );
          // Native logs "[AVG.GridBG] Image Count {0} of GridBG is
          // incorrect." / "... is empty." then clears the panel via
          // `_ResetPanel()` and returns false (2.7.61: 0x183e76cb8-0x183e77675).
          await this.renderer.clearGridBackground(0);
          return "continue";
        }

        await this.renderer.setGridBackground({
          assetKind: groupSelection.assetKind,
          block,
          fadeMs,
          imageKeys,
          initPositionMode,
          layout: "grid",
          scaleX: toNumber(this.exactArg(args, "xScale"), 1),
          scaleY: toNumber(this.exactArg(args, "yScale"), 1),
          solidHeights,
          solidWidths,
          x: toNumber(this.exactArg(args, "x"), 0),
          y: toNumber(this.exactArg(args, "y"), 0),
        });
        return "continue";
      }

      case "verticalbg": {
        // Native port: Torappu.AVG.LargeBackgroundPanel._ExecuteVerticalBG.
        // It accepts one solidwidth float and up to four vertically stacked
        // tiles; fadetime stays literal (unscaled) like the rest of the family.
        // `initposmode` is always read (default "default") and its offset is
        // written unconditionally at the end of the load branch
        // (2.7.61: 0x183e79e3e-0x183e79f8d).
        const imageGroup = toString(this.exactArg(args, "imagegroup"));
        const cgGroup = toString(this.exactArg(args, "cggroup"));
        const groupSelection = resolveGroupedAssetSelection(
          imageGroup,
          cgGroup,
        );
        // POSITION_INIT_FUNCTION (0x183e7b120) only registers the four known
        // modes; a key miss still writes (0, 0) — the same offset `center`
        // produces — so unknown values map to center like the largebg/gridbg
        // siblings, not to default.
        const initPositionModeArg = toString(
          this.exactArg(args, "initposmode"),
          "default",
        );
        const initPositionMode =
          initPositionModeArg === "default" ||
          initPositionModeArg === "upperleft" ||
          initPositionModeArg === "lowercenter" ||
          initPositionModeArg === "center"
            ? initPositionModeArg
            : "center";
        const fadeMs = Math.max(
          0,
          toNumber(this.exactArg(args, "fadetime"), 0) * 1000,
        );
        const block =
          fadeMs > 0 && toBoolean(this.exactArg(args, "block"), false);

        if (!groupSelection) {
          await this.renderer.clearGridBackground(fadeMs, block);
          return "continue";
        }

        const imageKeys = groupSelection.groupValue
          .split("/")
          .map((item) => this.resolveImageKey(item))
          .filter((key): key is string => key !== null);
        const solidWidth = toNumber(this.exactArg(args, "solidwidth"), 0);
        const solidWidths = solidWidth > 0 ? [solidWidth] : [];
        const solidHeights = parseNumberSequence(
          this.exactArg(args, "solidheight"),
        ).slice(0, imageKeys.length);

        if (imageKeys.length === 0) {
          // Native logs "[AVG.VerticalBG] Image {0} of VerticalBG is Empty."
          // then `_ResetPanel()` wipes the current composition before the
          // command fails, so mirror the instant clear here.
          this.warn(
            "parse",
            "verticalbg imagegroup is empty",
            line.lineNumber,
            line.command,
          );
          await this.renderer.clearGridBackground(0, false);
          return "continue";
        }

        if (
          imageKeys.length > 4 ||
          solidWidths.length !== 1 ||
          solidHeights.length !== imageKeys.length
        ) {
          // Same native error path: LogError ("Image Count ... incorrect." /
          // "Height of Image ... is empty/incorrect.") + `_ResetPanel()` (an
          // instant reset without any fade), clearing the previous backdrop.
          this.warn(
            "parse",
            `verticalbg expects width_count * height_count === image_count, got ${solidWidths.length} * ${solidHeights.length} !== ${imageKeys.length}`,
            line.lineNumber,
            line.command,
          );
          await this.renderer.clearGridBackground(0, false);
          return "continue";
        }

        if (imageKeys.length === 1) {
          // Native reads heightList[1] for the panel sizeDelta with a raw
          // get_Item (2.7.61: 0x183e79b2f-0x183e79b7a), so a single tile
          // aborts with ArgumentOutOfRangeException. We keep rendering with
          // the quirk-tolerant pivot but warn to stay observable.
          this.warn(
            "parse",
            "verticalbg with a single tile would crash the native client",
            line.lineNumber,
            line.command,
          );
        }

        await this.renderer.setGridBackground({
          assetKind: groupSelection.assetKind,
          block,
          fadeMs,
          imageKeys,
          initPositionMode,
          layout: "vertical",
          scaleX: toNumber(this.exactArg(args, "xScale"), 1),
          scaleY: toNumber(this.exactArg(args, "yScale"), 1),
          solidHeights,
          solidWidths,
          x: toNumber(this.exactArg(args, "x"), 0),
          y: toNumber(this.exactArg(args, "y"), 0),
        });
        return "continue";
      }

      case "largebg": {
        // Native port: Torappu.AVG.LargeBackgroundPanel._ExecuteImage (2.7.61,
        // VA 0x183e77ee0; the LargeBackgroundPanel method, not AVGImagePanel's
        // namesake). It composes two horizontal tiles and keeps fadetime
        // literal. Every validation/load failure makes native log an error,
        // call `_ResetPanel()` and return false without blocking — mirrored
        // below by clearing the grid background before continuing.
        const imageGroup = toString(this.exactArg(args, "imagegroup"));
        const cgGroup = toString(this.exactArg(args, "cggroup"));
        const groupSelection = resolveGroupedAssetSelection(
          imageGroup,
          cgGroup,
        );
        const initPositionModeArg = toString(
          this.exactArg(args, "initposmode"),
          "default",
        );
        // Native port: POSITION_INIT_FUNCTION only registers
        // upperleft/center/lowercenter/default (VA 0x183e7b120). An
        // unregistered key still writes `_initOffset.localPosition =
        // (0,0,0)` (VA 0x183e78d10) — the same offset as `center` — so
        // unknown values fall back to center, not default.
        const initPositionMode =
          initPositionModeArg === "default" ||
          initPositionModeArg === "lowercenter" ||
          initPositionModeArg === "upperleft"
            ? initPositionModeArg
            : "center";
        const fadeMs = Math.max(
          0,
          toNumber(this.exactArg(args, "fadetime"), 0) * 1000,
        );
        const block =
          fadeMs > 0 && toBoolean(this.exactArg(args, "block"), false);

        if (!groupSelection) {
          await this.renderer.clearGridBackground(fadeMs, block);
          return "continue";
        }

        const imageKeys = groupSelection.groupValue
          .split("/")
          .map((item) => this.resolveImageKey(item))
          .filter((key): key is string => key !== null);
        const solidWidths = parseNumberSequence(
          this.exactArg(args, "solidwidth"),
        ).slice(0, 2);
        // Native port: `solidheight` (float, default 0.0) has no validation —
        // 0 still lays out a zero-height, invisible composition that runs its
        // fade and honors block for the full fadetime.
        const solidHeight = toNumber(this.exactArg(args, "solidheight"), 0);
        const solidHeights = [solidHeight];

        if (imageKeys.length === 0) {
          this.warn("parse", "largebg imagegroup is empty");
          await this.renderer.clearGridBackground(0);
          return "continue";
        }

        if (imageKeys.length !== 2 || solidWidths.length !== 2) {
          this.warn(
            "parse",
            `largebg expects width_count * height_count === image_count, got ${solidWidths.length} * 1 !== ${imageKeys.length}`,
          );
          await this.renderer.clearGridBackground(0);
          return "continue";
        }

        await this.renderer.setGridBackground({
          assetKind: groupSelection.assetKind,
          block,
          fadeMs,
          imageKeys,
          initPositionMode,
          layout: "large",
          scaleX: toNumber(this.exactArg(args, "xScale"), 1),
          scaleY: toNumber(this.exactArg(args, "yScale"), 1),
          solidHeights,
          solidWidths,
          x: toNumber(this.exactArg(args, "x"), 0),
          y: toNumber(this.exactArg(args, "y"), 0),
        });
        return "continue";
      }

      case "largeimg": {
        // Web-only compatibility extension: no native panel registers `largeimg`
        // in the documented client; native `image` is its closest equivalent.
        const imageGroup = toString(this.arg(args, "imagegroup"));
        const cgGroup = toString(this.arg(args, "cggroup"));
        const groupSelection = resolveGroupedAssetSelection(
          imageGroup,
          cgGroup,
          "image",
        );
        const groupValue = groupSelection?.groupValue ?? "";
        const fadeMs = Math.max(
          0,
          Math.round(
            toNumber(this.arg(args, "fadetime"), groupValue ? 0.15 : 0) * 1000,
          ),
        );
        const block = toBoolean(
          this.arg(args, "blok"),
          toBoolean(
            this.arg(args, "isblock"),
            toBoolean(this.arg(args, "block"), false),
          ),
        );

        if (!groupSelection) {
          await this.renderer.clearLargeImage(fadeMs, block);
          return "continue";
        }

        const imageKeys = groupSelection.groupValue
          .split("/")
          .map((item) => this.resolveImageKey(item))
          .filter((key): key is string => key !== null);
        const solidWidths = parseNumberSequence(this.arg(args, "solidwidth"));
        const solidHeights = parseNumberSequence(this.arg(args, "solidheight"));

        if (imageKeys.length === 0) {
          this.warn("parse", "largeimg imagegroup is empty");
          return "continue";
        }

        const expectedTileCount = solidWidths.length * solidHeights.length;
        if (
          solidWidths.length === 0 ||
          solidHeights.length === 0 ||
          expectedTileCount !== imageKeys.length
        ) {
          this.warn(
            "parse",
            `largeimg expects width_count * height_count === image_count, got ${solidWidths.length} * ${solidHeights.length} !== ${imageKeys.length}`,
          );
          return "continue";
        }

        await this.renderer.setLargeImage({
          assetKind: groupSelection.assetKind,
          block,
          fadeMs,
          imageKeys,
          layout: "large",
          scaleX: Math.max(0, toNumber(this.arg(args, "xscale"), 1)),
          scaleY: Math.max(0, toNumber(this.arg(args, "yscale"), 1)),
          solidHeights,
          solidWidths,
          x: toNumber(this.arg(args, "x"), 0),
          y: toNumber(this.arg(args, "y"), 0),
        });
        return "continue";
      }

      case "image": {
        // Native port: Torappu.AVG.AVGImagePanel._ExecuteImage. This is the
        // foreground-panel registration of the same inherited executor used by
        // the `background` command (AVGImagePanel.GetExecutors @0x183e56250
        // binds "image" → _ExecuteImage @0x183e57cf0; BackgroundPanel binds
        // "background" to the same MethodInfo). Covers the clear branch, the
        // load-failure clear branch, the scaled fade and the block boundary.
        const image = toString(this.exactArg(args, "image"));
        const fadeMs = this.calculateFadeMs(this.exactArg(args, "fadetime"));
        const block =
          fadeMs > 0 && toBoolean(this.exactArg(args, "block"), false);
        if (!image) {
          await this.renderer.clearImage(fadeMs, block);
          return "continue";
        }

        const resolved = this.resolveImageKey(image);
        if (!resolved) {
          this.warn("missing_asset", `image: ${image}`);
          await this.renderer.clearImage(fadeMs, block);
          return "continue";
        }

        await this.renderer.setImage(resolved, {
          block,
          fadeMs,
          // `_LoadImage` multiplies the SetNativeSize rect by the `width`/
          // `height` params (GetOrDefault<float>(..., 1.0); the mulss at
          // 0x183e587b0/0x183e587b4 in build 2761) before screenadapt reads it.
          height: toNumber(this.exactArg(args, "height"), 1),
          scaleX: toNumber(this.exactArg(args, "xScale"), 1),
          scaleY: toNumber(this.exactArg(args, "yScale"), 1),
          screenAdapt: this.parseScreenAdapt(
            this.exactArg(args, "screenadapt"),
          ),
          tiled: toBoolean(this.exactArg(args, "tiled"), false),
          width: toNumber(this.exactArg(args, "width"), 1),
          x: toNumber(this.exactArg(args, "x"), 0),
          y: toNumber(this.exactArg(args, "y"), 0),
        });
        return "continue";
      }

      case "showitem": {
        // Native port: Torappu.AVG.AVGShowItemPanel._ExecuteShowItem. `_slotStyles`
        // only registers `photo` and `cutin`; `cg` and anything else
        // miss _FindSlotStyle, which logs an error and finishes the command
        // without rendering. Every shipped sample is the default `photo`.
        const fadeMs = Math.max(
          0,
          Math.round(toNumber(this.exactArg(args, "fadetime"), 0.5) * 1000),
        );
        const style = toString(this.exactArg(args, "style"), "photo");
        if (style !== "photo" && style !== "cutin") {
          // The style lookup lives in `_ShowItem`, which the replacement branch
          // only reaches through the old slot's `Hide` -> `b__0` (`_Reset`):
          // a live slot still fades out with this command's fadetime and is
          // destroyed before the LogError + FinishCommand.
          if (this.itemSlotInUse) {
            this.itemSlotInUse = false;
            await this.renderer.clearItems(fadeMs, true);
          }
          this.warn(
            "invalid_parameter",
            `showitem style is not registered: ${style}`,
            line.lineNumber,
            line.command,
          );
          return "continue";
        }

        // Native `_ShowItem` (0x183E5C290) never guards an empty `image`
        // (default ""): it still instantiates the slot, the sprite load fails
        // and the slot fades in with only its 100x100 placeholder, blocking
        // like any other showitem (and filling `_slotInUse` for a later
        // hideitem). A null key takes the renderer's failed-load path, which
        // draws exactly that.
        const image = toString(this.exactArg(args, "image"));
        const resolved = this.resolveImageKey(image);
        if (!resolved)
          this.warn(
            "invalid_parameter",
            "showitem: image is empty",
            line.lineNumber,
            line.command,
          );

        // Native port scope: AVGShowItemPanel._ExecuteShowItem / _ExecuteHideItem.
        // Neither executor reads `block`: showitem always returns true, and
        // hideitem returns true only while a slot is actually in use. The photo
        // slot's serialized defaults are _defaultFadeTime 0.5 and
        // _defaultBlackAlpha 0.4; offsetx/offsety default to a hardcoded 0.
        await this.renderer.showItem({
          // `GetFloat("black", 0.4)` applies no range constraint; out-of-range
          // values saturate at blend time on the Unity side, and the renderer
          // clamps at its draw sites to the same effect.
          blackAlpha: toNumber(this.exactArg(args, "black"), 0.4),
          block: true,
          fadeMs,
          // `fadestyle`/`width` are read only by the cutin slot's Show; an
          // unknown fadestyle degrades to `fade` (native enum default).
          fadeStyle: parseShowItemFadeStyle(
            toString(this.exactArg(args, "fadestyle")),
          ),
          key: resolved,
          offsetX: toNumber(this.exactArg(args, "offsetx"), 0),
          offsetY: toNumber(this.exactArg(args, "offsety"), 0),
          style,
          width: toNumber(this.exactArg(args, "width"), Number.NaN),
        });
        this.itemSlotInUse = true;
        return "continue";
      }

      case "hideitem": {
        // Native port: Torappu.AVG.AVGShowItemPanel._ExecuteHideItem
        // (GameAssembly 2.7.61 @ 0x183E5BCE0). The executor reads no story
        // parameter for gating (`block` is ignored); no live slot returns
        // false, a live slot always returns true and blocks until the slot's
        // Hide tween completes (_Reset + FinishCommand). `fadetime` falls back
        // to the slot's own serialized `_defaultFadeTime` (0.5s). The gate is
        // the `_slotInUse` reference, which showitem fills even for an empty
        // or unloadable image (that slot fades in with its placeholder,
        // blocks, and later fades out), and `itemSlotInUse` follows it.
        const hadItem = this.itemSlotInUse;
        this.itemSlotInUse = false;
        await this.renderer.clearItems(
          Math.max(
            0,
            Math.round(toNumber(this.exactArg(args, "fadetime"), 0.5) * 1000),
          ),
          hadItem,
        );
        return "continue";
      }

      case "cgitem": {
        // Native port: Torappu.AVG.AVGCgItemPanel._ExecuteShowCgItem. This
        // adapter preserves the id-derived slot key and independent transform
        const image = toString(this.exactArg(args, "image"));
        const id = toString(this.exactArg(args, "id"));
        const key = id ? `${image}_${id}` : image;
        const style = toString(this.exactArg(args, "style"), "cg");
        if (style === "blocker") {
          // Native port scope: `AVGCgItemPanel._ShowItem` (2.7.81
          // 0x183fb12b0) runs its common prefix (instantiate the style's
          // slot prefab, dispose the old same-key entry, write
          // m_slotsInUseDict, bind PostDisplay) for `style="blocker"` as
          // well; it then skips the sprite load, calls the blocker slot's
          // `Show(command, null, null)` and finishes the command at once.
          // The web player has no such prefab, so the whole command is
          // deliberately omitted here (corpus usage: 0).
          this.warn(
            "unsupported_command",
            "cgitem style=blocker uses a native-only scene sprite",
          );
          return "continue";
        }
        if (style !== "cg") {
          this.warn(
            "invalid_parameter",
            `cgitem style is not registered: ${style}`,
          );
          return "continue";
        }
        if (!image) {
          this.warn("missing_asset", "cgitem: (empty)");
          return "continue";
        }
        const resolved = this.resolveImageKey(image);
        if (!resolved) {
          this.warn("missing_asset", `cgitem: ${image}`);
          return "continue";
        }
        const seconds = (name: string) =>
          Math.max(0, toNumber(this.exactArg(args, name), 0) * 1000);
        const colorFrom = parseCgColor(this.exactArg(args, "cfrom"));
        const colorTo = parseCgColor(this.exactArg(args, "cto"));
        await this.renderer.showCgItem({
          alphaDelayMs: seconds("adelay"),
          alphaDurationMs: seconds("aduration"),
          alphaFrom: toNumber(this.exactArg(args, "afrom"), 1),
          alphaTo: toNumber(this.exactArg(args, "ato"), 1),
          assetKey: resolved,
          block: toBoolean(this.exactArg(args, "block"), false),
          colorFrom: colorFrom && colorTo ? colorFrom : undefined,
          colorTo: colorFrom && colorTo ? colorTo : undefined,
          // `AVGShowItemCgSlot.Show` (2.7.81 0x18405dde0) reads the curve with
          // `GetEnum<Ease>(param, "ease", (Ease)1, ignoreCase: false)`. In
          // DOTween's `Ease` enum `Unset = 0, Linear = 1, InSine = 2`, so the
          // default is `Ease.Linear`, not an eased curve; 185/188 corpus
          // cgitem lines omit `ease` and therefore move linearly.
          ease: toString(this.exactArg(args, "ease"), "Linear"),
          height: Math.trunc(toNumber(this.exactArg(args, "height"), 0)),
          key,
          positionDelayMs: seconds("pdelay"),
          positionDurationMs: seconds("pduration"),
          positionFrom: parseCgVector2(this.exactArg(args, "pfrom")),
          positionTo: parseCgVector2(this.exactArg(args, "pto")),
          rotationDurationMs: seconds("rduration"),
          rotationFrom: toNumber(this.exactArg(args, "rfrom"), -1),
          rotationTo: toNumber(this.exactArg(args, "rto"), 0),
          scaleDelayMs: seconds("sdelay"),
          scaleDurationMs: seconds("sduration"),
          scaleFrom: toNumber(this.exactArg(args, "sfrom"), 1),
          scaleTo: toNumber(this.exactArg(args, "sto"), 1),
          width: Math.trunc(toNumber(this.exactArg(args, "width"), 0)),
        });
        return "continue";
      }

      case "hidecgitem": {
        // Native port: Torappu.AVG.AVGCgItemPanel._ExecuteHideCgItem. An omitted
        // key clears all slots; a supplied image/id selects one.
        const image = toString(this.exactArg(args, "image"));
        const id = toString(this.exactArg(args, "id"));
        const key = image || id ? (id ? `${image}_${id}` : image) : undefined;
        // `AVGShowItemCgSlot.Hide` (2.7.81 0x18405da70) resolves the fade as
        // `GetFloat(param, "fadetime", 0.13)` and then replaces it wholesale
        // with `Command.TryGetParam(string, out float)` (0x183fbf5a0) when
        // the script wrote `duration` -- no combining. TryGetParam hits on
        // key presence and runs `Convert.ToSingle`, so an unparseable value
        // throws in native; like toNumber, the port keeps fadetime instead of
        // breaking playback. Clear-all fades every slot through the same
        // `Hide`, so the override applies there too. It is exclusive to the
        // CG slot: photo/cutin `Hide` (0x18405fc60 / 0x18405f0e0) read
        // fadetime only, so `hideitem` is unaffected. Corpus:
        // act54side/level_act54side_08_beg.txt:540-556 (keyed, duration=3/2)
        // and act52side/level_act52side_08_end.txt:227 (clear-all,
        // duration=2).
        const fadeSeconds =
          toOptionalNumber(this.exactArg(args, "duration")) ??
          toNumber(this.exactArg(args, "fadetime"), 0.13);
        await this.renderer.clearCgItems(
          key,
          Math.max(0, Math.round(fadeSeconds * 1000)),
          // `AVGShowItemCgSlot.Hide` (2.7.81 0x18405da70) reads the curve
          // with `GetEnum<Ease>(param, "ease", (Ease)1, ignoreCase: false)`;
          // DOTween `Ease` 1 is Linear (`Unset` = 0, `InSine` = 2), the same
          // default as Show. No corpus hidecgitem line writes `ease`.
          toString(this.exactArg(args, "ease"), "Linear"),
          toBoolean(this.exactArg(args, "block"), false),
        );
        return "continue";
      }

      case "imagetween": {
        // Native port: Torappu.AVG.AVGImagePanel._ExecuteImageTween. Its
        // duration bypasses CalculateFadetime entirely (unlike `image`'s
        // fadetime), block only takes effect while duration > 0
        // (effectiveBlock), and `ease` (GetEnum<Ease>, default Linear) is
        // applied to both the position and scale tweens. `loop` feeds
        // SetLoops(2*!loop - 1) exactly like `backgroundtween`, which shares
        // this executor (2.7.71 VA 0x183f055b0): true → infinite Restart loop.
        const durationMs = Math.max(
          0,
          toNumber(this.exactArg(args, "duration"), 0) * 1000,
        );
        const block =
          durationMs > 0 && toBoolean(this.exactArg(args, "block"), false);
        const loop = toBoolean(this.exactArg(args, "loop"), false);
        if (block && loop) {
          // `_ExecuteImageTween` logs this (sic) error when loop and
          // effectiveBlock are both true, because SetLoops(-1) never reaches
          // OnComplete(FinishCommand). The string is shared with
          // `backgroundtween` and keeps its native typos; block is dropped
          // below for the same reason as there.
          this.warn(
            "invalid_parameter",
            "Loop and block both true when tween background! Will cause intinity lop!",
            line.lineNumber,
            line.command,
          );
        }
        await this.renderer.setImageTween({
          block: block && !loop,
          durationMs,
          ease: toString(this.exactArg(args, "ease"), "Linear"),
          loop,
          xFrom: toOptionalNumber(this.exactArg(args, "xFrom")),
          xScaleFrom: toOptionalNumber(this.exactArg(args, "xScaleFrom")),
          xScaleTo: toOptionalNumber(this.exactArg(args, "xScaleTo")),
          xTo: toOptionalNumber(this.exactArg(args, "xTo")),
          yFrom: toOptionalNumber(this.exactArg(args, "yFrom")),
          yScaleFrom: toOptionalNumber(this.exactArg(args, "yScaleFrom")),
          yScaleTo: toOptionalNumber(this.exactArg(args, "yScaleTo")),
          yTo: toOptionalNumber(this.exactArg(args, "yTo")),
        });
        return "continue";
      }

      case "imagerotate": {
        // Native port: Torappu.AVG.AVGImagePanel._ExecuteImageRotate. Unlike
        // the panel's tween executors, fadetime routes through
        // CalculateFadetime (animateRatio scaling, see calculateFadeMs); the
        // `ease` argument is never read — native hardcodes Ease.Linear.
        await this.renderer.setImageRotate({
          angleDeg: toNumber(this.exactArg(args, "angle"), 0),
          block: toBoolean(this.exactArg(args, "block"), false),
          circles: Math.trunc(toNumber(this.exactArg(args, "circles"), 0)),
          durationMs: this.calculateFadeMs(this.exactArg(args, "fadetime")),
          inverse: toBoolean(this.exactArg(args, "inverse"), false),
        });
        return "continue";
      }

      case "largebgtween": {
        // Native port: Torappu.AVG.LargeBackgroundPanel._ExecuteImageTween.
        // It transforms the existing large-background container without loading
        // assets; `duration` is literal seconds (the panel bypasses
        // CalculateFadetime/animateRatio) and `duration <= 0` forces a
        // non-blocking snap to the To pose.
        const durationMs = Math.max(
          0,
          toNumber(this.exactArg(args, "duration"), 0) * 1000,
        );
        const block =
          durationMs > 0 && toBoolean(this.exactArg(args, "block"), false);
        // `GetBool("loop", false)` feeds SetLoops(2*!loop-1): loop=true runs
        // the tween as an infinite Restart loop.
        const loop = toBoolean(this.exactArg(args, "loop"), false);
        if (block && loop) {
          // Native DLog.LogError text verbatim (typos and the copied
          // "tween background" wording included), logged when
          // effectiveBlock && loop. Native then blocks on a tween that never
          // completes and the story hangs; we keep the error but drop block
          // so playback continues.
          this.warn(
            "invalid_parameter",
            "Loop and block both true when tween background! Will cause intinity lop!",
          );
        }

        await this.renderer.setLargeBackgroundTween({
          block: block && !loop,
          durationMs,
          // `GetEnum<Ease>("ease", 1)`: DOTween Ease name or ordinal string,
          // default Linear (= 1).
          ease: toString(this.exactArg(args, "ease"), "Linear"),
          loop,
          xFrom: toOptionalNumber(this.exactArg(args, "xFrom")),
          xScaleFrom: toOptionalNumber(this.exactArg(args, "xScaleFrom")),
          xScaleTo: toOptionalNumber(this.exactArg(args, "xScaleTo")),
          xTo: toOptionalNumber(this.exactArg(args, "xTo")),
          yFrom: toOptionalNumber(this.exactArg(args, "yFrom")),
          yScaleFrom: toOptionalNumber(this.exactArg(args, "yScaleFrom")),
          yScaleTo: toOptionalNumber(this.exactArg(args, "yScaleTo")),
          yTo: toOptionalNumber(this.exactArg(args, "yTo")),
        });
        return "continue";
      }

      case "largeimgtween": {
        // Web-only compatibility extension paired with `largeimg`; it has no
        // native executor or registration in the investigated client (2.7.61
        // has no `largeimgtween` key in any GetExecutors table). Semantics
        // follow the closest native relative, `largebgtween`
        // (`Torappu.AVG.LargeBackgroundPanel._ExecuteImageTween`), with two
        // deliberate Web-only extensions: keys are matched
        // case-insensitively (`xFrom` and `xfrom` both hit; native reads
        // exact CamelCase), and the eight tween params fall back to the
        // static `x`/`y`/`xscale`/`yscale` keys before the current
        // transform (native always falls back to the current transform).
        const durationMs = Math.max(
          0,
          // Native GetOrDefault<float>("duration", 0.0): omitted duration
          // snaps instantly instead of tweening.
          toNumber(this.arg(args, "duration"), 0) * 1000,
        );
        const block =
          durationMs > 0 && toBoolean(this.arg(args, "block"), false);
        // `GetBool("loop", false)` feeds SetLoops(2*!loop-1): loop=true runs
        // the tween as an infinite Restart loop.
        const loop = toBoolean(this.arg(args, "loop"), false);
        if (block && loop) {
          // Native DLog.LogError text verbatim (typos and the copied
          // "tween background" wording included), logged when
          // effectiveBlock && loop. Native then blocks on a tween that never
          // completes and the story hangs; we keep the error but drop block
          // so playback continues.
          this.warn(
            "invalid_parameter",
            "Loop and block both true when tween background! Will cause intinity lop!",
          );
        }

        const xScale = toOptionalNumber(this.arg(args, "xscale"));
        const yScale = toOptionalNumber(this.arg(args, "yscale"));
        const x = toOptionalNumber(this.arg(args, "x"));
        const y = toOptionalNumber(this.arg(args, "y"));

        await this.renderer.setLargeImageTween({
          block: block && !loop,
          durationMs,
          // `GetEnum<Ease>("ease", 1)`: DOTween Ease name or ordinal string,
          // default Linear (= 1).
          ease: toString(this.arg(args, "ease"), "Linear"),
          loop,
          xFrom: toOptionalNumber(this.arg(args, "xfrom")) ?? x,
          xScaleFrom: toOptionalNumber(this.arg(args, "xscalefrom")) ?? xScale,
          xScaleTo: toOptionalNumber(this.arg(args, "xscaleto")) ?? xScale,
          xTo: toOptionalNumber(this.arg(args, "xto")) ?? x,
          yFrom: toOptionalNumber(this.arg(args, "yfrom")) ?? y,
          yScaleFrom: toOptionalNumber(this.arg(args, "yscalefrom")) ?? yScale,
          yScaleTo: toOptionalNumber(this.arg(args, "yscaleto")) ?? yScale,
          yTo: toOptionalNumber(this.arg(args, "yto")) ?? y,
        });
        return "continue";
      }

      case "blocker": {
        // Native port: Torappu.AVG.AVGBlockerPanel._ExecuteBlocker. The malformed
        // default `defualt` is intentional. Like every IFadeTimeRatio panel,
        // blocker routes fadetime through AVGUtils.CalculateFadetime
        // (`AVGController.animateRatio * fadetime`, 2.7.61 VA 0x183e3040e), so
        // quick_play (animateRatio = 0) collapses into the native IsZero branch:
        // instant recolor and a forced non-blocking return.
        const styleArg = toString(this.exactArg(args, "style"), "defualt");
        const style =
          styleArg === "slider" || styleArg === "verticalslider"
            ? styleArg
            : "default";
        const fadeMs = this.calculateFadeMs(
          this.exactArg(args, "fadetime"),
          0.4,
        );

        await this.renderer.setBlocker({
          block: fadeMs > 0 && toBoolean(this.exactArg(args, "block"), false),
          fadeMs,
          from: {
            a: toNumber(this.exactArg(args, "afrom"), Number.NaN),
            b: toNumber(this.exactArg(args, "bfrom"), Number.NaN),
            g: toNumber(this.exactArg(args, "gfrom"), Number.NaN),
            r: toNumber(this.exactArg(args, "rfrom"), Number.NaN),
          },
          image: toString(this.exactArg(args, "image")) || undefined,
          inverse: toBoolean(this.exactArg(args, "inverse"), false),
          style,
          to: {
            a: toNumber(this.exactArg(args, "a"), 1),
            b: toNumber(this.exactArg(args, "b"), 0),
            g: toNumber(this.exactArg(args, "g"), 0),
            r: toNumber(this.exactArg(args, "r"), 0),
          },
        });
        return "continue";
      }

      case "curtain": {
        const direction = Math.trunc(
          toNumber(this.exactArg(args, "direction"), -1),
        );
        // Native port: `AVGCurtainPanel._ExecuteCurtain` inlines
        // `scaledFadetime = AVGController.animateRatio * fadetime`
        // (AVGUtils.CalculateFadetime; the panel implements IFadeTimeRatio),
        // with fadetime defaulting to the panel's `_defaultFadetime` (0.4).
        // quick_play (animateRatio 0) therefore always lands in the instant
        // branch / instant all-side reset below.
        const fadeMs = this.calculateFadeMs(
          this.exactArg(args, "fadetime"),
          0.4,
        );
        // It zeroes its closure's block field on both the zero-fadetime and
        // the direction < 0 paths, so only a real curtain tween can block --
        // the same short circuit blocker has.
        const block =
          fadeMs > 0 && toBoolean(this.exactArg(args, "block"), false);

        if (direction < 0) {
          await this.renderer.clearCurtains(fadeMs, false);
          return "continue";
        }

        if (direction > 7) {
          this.warn("invalid_parameter", `curtain direction:${direction}`);
          return "continue";
        }
        const alpha = toNumber(this.exactArg(args, "a"), -1);

        await this.renderer.setCurtain({
          alphaFrom: toOptionalNumber(this.exactArg(args, "afrom")),
          alphaTo: alpha >= 0 ? alpha : undefined,
          block,
          delayMs: Math.max(
            0,
            toNumber(this.exactArg(args, "delay"), 0) * 1000,
          ),
          direction,
          fadeMs,
          fillFrom: toNumber(this.exactArg(args, "fillfrom"), 1),
          fillTo: toNumber(this.exactArg(args, "fillto"), 0),
          grad: toBoolean(this.exactArg(args, "grad"), false),
        });
        return "continue";
      }

      case "charslot": {
        const rawSlot = toString(args.slot).trim();
        const slot = this.parseCharacterSlot(rawSlot);
        const nameRef = toString(args.name);
        // Native port: Torappu.AVG.AVGCharacterslotPanel._ExecuteCharslot
        // (2.7.61, VA 0x183e4d310). Duration defaults to 0.0 and goes through
        // CalculateFadetime; zero skips animation.
        const durationMs = Math.round(this.calculateFadeMs(args.duration, 0));
        // `end` (default true) is neither a transform-preservation switch nor
        // a defer switch. `_GetCachedSlotSeq` (0x183e4f830) hands back a fresh
        // `DOTween.Sequence()` whenever the previous one already played, and
        // `DOTween.Sequence()` (0x184109110) starts it playing because
        // `defaultAutoPlay` is `AutoPlay.All` (cctor 0x18410b0e0) -- the tweens
        // run either way. All `end` gates is the
        // `OnComplete(_SetSeqPlayed)` + `Play()` pair at 0x183e4e501, and the
        // `isblock` check nested inside it at 0x183e4e56f: on the slot path
        // `isblock` only ever blocks when `end` is true.
        const isEnd = toString(args.end).trim().toLowerCase() !== "false";
        const rawBlock = toBoolean(args.isblock, false);
        const block = rawBlock && isEnd;

        // The clear branch keys off an empty `slot`, never an empty `name`, and it
        // only touches the three built-in slots (custom slots are left alone).
        if (!rawSlot) {
          const clearPromise = this.renderer.clearCharacters(
            undefined,
            durationMs,
          );
          // This branch returns before the sequence is ever built, so it hands
          // `isBlock` straight to `_CleanSlotsWithTween` (0x183e4e5c3) without
          // the `end` gate the slot path has.
          if (rawBlock) await clearPromise;
          else void clearPromise;
          return "continue";
        }

        if (!slot) {
          // `custom` and any other unknown slot name resolve through
          // _TryPrepareCustomSlotCommand / _GetSlotWithName, which we do not model.
          this.warn(
            "unsupported_visual",
            `charslot slot is not a built-in slot: ${rawSlot}`,
            line.lineNumber,
            line.command,
          );
          return "continue";
        }

        // `name` is never ToLower'd natively, and `_UpdateSeqWithParam`
        // (0x183e53940) compares it to "char_empty" with an ordinal
        // String.op_Equality. That value runs AVGCharacterSlot.SlotCleanChar
        // (0x183eb4260) and then still falls through to SlotSetCharWithParam
        // with the same name: two `_SwapImages` in a row put the old art back
        // in front, and the second `_LoadImage` (0x183eb4f60) opens with
        // `DOKill(m_image)`, killing the fade the first swap started. Whether
        // "char_empty" then resolves to a blank sprite hub (the
        // `m_currentKey.ToLower() != "char_empty"` guard in
        // `_SlotSetCharInternal` suggests it does) or fails into
        // `set_sprite(null)` + `enabled = false`, the old art is gone at once:
        // the slot is emptied regardless of `duration`; action/focus keep
        // executing.
        const isEmptyChar = nameRef === "char_empty";

        let resolved: { base: string; expression: string } | null = null;
        let clearPromise: Promise<void> | null = null;
        if (isEmptyChar) {
          clearPromise = Promise.resolve(
            this.renderer.clearCharacters(slot, 0),
          );
        } else if (nameRef) {
          const resolution = this.resolveCharacterName(nameRef);
          if (resolution.kind === "native_throws")
            return this.warnNativeSlotThrows(nameRef, line);
          resolved = resolution.kind === "found" ? resolution.selection : null;
          if (!resolved) {
            // `_SlotSetCharInternal` (0x183eb5830) swaps the Images *before*
            // `_LoadImage`, so a failed load ("[AVG] Error to load character
            // pic") leaves the old art as the back Image -- which
            // `_GenBackImageTween(duration).Play()` fades out -- while the new
            // fore Image is disabled. The slot ends up empty; the action and
            // focus sections of `_UpdateSeqWithParam` still run.
            this.warn("missing_asset", `character: ${nameRef}`);
            clearPromise = Promise.resolve(
              this.renderer.clearCharacters(slot, durationMs),
            );
          }
        }
        if (clearPromise) {
          if (block) await clearPromise;
          else void clearPromise;
        }

        // Native `_UpdateSeqWithParam` alpha handling:
        // - with a `name`, a negative (or omitted, default -1) afrom or ato
        //   resets the pair to (0, 1): a plain named charslot always fades
        //   the new art in over `duration`;
        // - without a `name`, only `GE(afrom, 0)` gates
        //   `SlotChangeAlpha(afrom, ato, duration)` (0x183eb3d20), and ato is
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
            alphaFrom = clamp(rawAlphaFrom, 0, 1);
            alphaTo = clamp(rawAlphaTo, 0, 1);
          }
        } else if (!nameRef && rawAlphaFrom >= 0) {
          alphaFrom = clamp(rawAlphaFrom, 0, 1);
          alphaTo = Math.min(1, rawAlphaTo);
        }

        await this.renderer.setCharacter({
          action: this.parseCharacterSlotAction(args.action),
          ...(args.angle === undefined
            ? {}
            : { angle: toNumber(args.angle, 0) }),
          alphaFrom,
          alphaTo,
          blackEnd:
            args.bend === undefined
              ? undefined
              : toNumber(args.bend, Number.NaN),
          blackStart:
            args.bstart === undefined
              ? undefined
              : toNumber(args.bstart, Number.NaN),
          block,
          characterKey: resolved?.base,
          ...(args.circles === undefined
            ? {}
            : { circles: Math.trunc(toNumber(args.circles, 0)) }),
          durationMs,
          expression: resolved?.expression,
          fadeIdentity: nameRef
            ? nativeCharacterFadeIdentity(nameRef)
            : undefined,
          focusMode: "subset",
          focusSlots: this.resolveCharacterSlotFocusSlots(args),
          ...(args.inverse === undefined
            ? {}
            : { inverse: toBoolean(args.inverse, false) }),
          nativeKey: nameRef || undefined,
          positionFrom: this.parseCharacterSlotPoint(args.posfrom),
          // `_ExecuteCharslot` treats a posto that is present but not an
          // "x,y" pair differently from posfrom/poszoom: those log a parse
          // error and keep the (1,1) default, posto falls back to
          // Vector2.zero (0x183e4e2db-0x183e4e322). Scalar `posto=0` lines
          // in the corpus therefore mean (0,0) natively.
          positionTo:
            this.parseCharacterSlotPoint(args.posto) ??
            (toString(args.posto).trim() ? { x: 0, y: 0 } : undefined),
          posZoom: this.parseCharacterSlotPoint(args.poszoom),
          power: Math.max(0, toNumber(args.power, 0)),
          randomness: clamp(toNativeIntParam(args.random, 10), 0, 100),
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
          slotSequence: true,
          stop: toBoolean(args.stop, false),
          // GetOrDefault<int>("times", 0): DOShakePosition vibrato for
          // shake, numJumps (clamped to >= 1 by DOLocalJump) for jump.
          times: toNativeIntParam(args.times, 0),
        });
        return "continue";
      }

      case "character": {
        const nameRef = toString(args.name);
        const name2Ref = toString(args.name2);
        const focus = toNumber(args.focus, 0);
        const durationMs = this.calculateFadeMs(args.fadetime, 0.15);
        // Native port: Torappu.AVG.CharacterPanel._ExecuteCharacter. It reads
        // `isblock`, not `block`, and returns it raw without registering any tween
        // callback -- returning true would
        // deadlock the queue since nothing ever calls FinishCommand. Scripts only
        // ever write `block=`, which is not a key this command reads, so the
        // command is effectively never blocking. Reproduce that, not the deadlock.
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

        for (const update of updates) {
          if (!update.name) {
            void this.renderer.clearCharacters(update.slot, durationMs);
            continue;
          }
          const resolution = this.resolveCharacterName(update.name);
          // Slots run MIDDLE -> LEFT -> RIGHT, so the ones before the throw
          // have already changed in native too; the rest never run.
          if (resolution.kind === "native_throws")
            return this.warnNativeSlotThrows(update.name, line);
          if (resolution.kind === "missing") {
            this.warn("missing_asset", `character: ${update.name}`);
            void this.renderer.clearCharacters(update.slot, durationMs);
            continue;
          }
          const resolved = resolution.selection;
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
          await this.renderer.setCharacter({
            blackEnd: toNumber(update.blackEnd, Number.NaN),
            blackStart: toNumber(update.blackStart, Number.NaN),
            block,
            characterKey: resolved.base,
            // Native: LEFT/MIDDLE use `(unsigned)focus <= 1 -> focusColor`,
            // RIGHT uses `(focus & 0xFFFFFFFD) == 0 -> focusColor`.
            dimmed:
              update.slot === "r" ? ![0, 2].includes(focus) : focus >>> 0 > 1,
            durationMs,
            enterFrom,
            enterPosition,
            expression: resolved.expression,
            fadeIdentity: nativeCharacterFadeIdentity(update.name),
            focus,
            nativeKey: update.name,
            slot: update.slot,
            transType,
          });
        }

        return "continue";
      }

      case "characteraction": {
        // Native port: Torappu.AVG.CharacterPanel._ExecuteCharacterAction
        // (0x183E699F0, build 2761; re-verified on 2.7.81 @ 0x183fd6c90 with
        // zero behavior change). All five branches scale fadetime through
        // CharacterPanel.CalculateFadetime (animateRatio × fadetime) and read
        // the blocking flag from `isblock` only — `_AddFinishCommand`
        // (0x183E698E0) never reads `block=` (only the cutin panel does), so
        // the thousands of legacy `block=` spellings in the corpus stay
        // non-blocking exactly like the native client.
        const type = this.parseCharacterActionType(args.type);
        if (!type) {
          this.warn(
            "parse",
            `characteraction type is invalid: ${toString(args.type)}`,
          );
          return "continue";
        }
        // GetOrDefault("name", "left"): a missing key resolves through the
        // "left" arm of each truth table (exit → left slot, others → left),
        // while an unrecognized value hits the else fallback instead.
        const slot = this.parseCharacterActionSlot(
          this.exactArg(args, "name") === undefined ? "left" : args.name,
          type,
        );

        // Per-branch GetOrDefault defaults: exit/zoom fade in for 1.0s while
        // move/jump/shake default to 0.5s.
        const fadetimeFallback = type === "exit" || type === "zoom" ? 1 : 0.5;
        const durationMs = this.calculateFadeMs(
          this.exactArg(args, "fadetime"),
          fadetimeFallback,
        );

        // NeedSkipAnimation (0x183E69680): jump/shake collapse into a plain
        // move when the scaled fadetime is zero (skip mode or fadetime=0);
        // the move executor then applies xpos/ypos instantly.
        const effectiveType: CharacterActionInput["type"] =
          (type === "jump" || type === "shake") && durationMs <= 0
            ? "move"
            : type;

        let pivot: { x: number; y: number } | undefined;
        if (type === "zoom") {
          // xpos/ypos are the [0,1] pivot of the character image (default
          // 0.5/0.5). AVGCharacterSlot.CharZoom (0x183EB2B50) returns null
          // for pivots outside [0,1], making the whole command a no-op.
          const pivotX = toNumber(args.xpos, 0.5);
          const pivotY = toNumber(args.ypos, 0.5);
          if (pivotX < 0 || pivotX > 1 || pivotY < 0 || pivotY > 1) {
            this.warn(
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
        const hasExitX = this.exactArg(args, "xpos") !== undefined;
        const hasExitY = this.exactArg(args, "ypos") !== undefined;
        const parsedDirection = this.parseCharacterActionDirection(
          args.direction,
        );
        const direction =
          type === "exit"
            ? (parsedDirection ??
              (this.exactArg(args, "direction") === undefined
                ? "left"
                : undefined))
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

        await this.renderer.runCharacterAction({
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
        } satisfies CharacterActionInput);
        return "continue";
      }

      case "charactercutin": {
        const widgetId = toString(args.widgetID);
        if (!widgetId) {
          this.warn("parse", "charactercutin widgetID is empty");
          return "continue";
        }

        const nameRef = toString(args.name).trim();
        const resolution = nameRef ? this.resolveCharacterName(nameRef) : null;
        if (resolution?.kind === "native_throws")
          return this.warnNativeSlotThrows(nameRef, line);
        const resolved =
          resolution?.kind === "found" ? resolution.selection : null;
        // Native port: Torappu.AVG.AVGCharacterCutinPanel._ExecuteCharacterCutin
        // (build 2761: 0x183e49440). Defaults come from the cutin slot's
        // serialized fields (_defaultFadetime = 0.4, _defaultSlotWidth = 200),
        // not from PRTS's 0.14 / 150. `block` really is the key here, unlike
        // the rest of the character family's `isblock`.
        //
        // AVGCharacterCutinSlot implements IFadeTimeRatio: every Show /
        // SlotUpdate / Hide duration is `animateRatio * fadetime` (Show
        // 0x183eb1320, SlotUpdate 0x183eb20a0, Hide 0x183eb0d80), so fadeMs
        // must route through calculateFadeMs instead of a bare *1000.
        const fadeMs = Math.round(this.calculateFadeMs(args.fadetime, 0.4));
        const block = toBoolean(args.block, false);

        // Native: an unresolvable `name` still allocates the slot and runs
        // its tween (AVGCharacterSlot logs its own error internally), so only
        // the character art is missing while the block timing survives. Keep
        // the warning for diagnostics and flag the renderer accordingly.
        if (nameRef && !resolved) {
          this.warn("missing_asset", `charactercutin: ${nameRef}`);
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

        // Native port: slot-layout keys are read verbatim by
        // AVGCharacterCutinSlot.Show/SlotUpdate (0x183eb1320 / 0x183eb20a0).
        // 2.7.61 renamed the slot scale key `scale` -> `zoom`;
        // povX/povY/charOffsetX/charOffsetY keep their CamelCase spelling --
        // native looks them up in a case-sensitive dictionary.
        //
        // These stay `undefined` when absent rather than collapsing to a
        // default here: Show and SlotUpdate disagree about what an omitted
        // key means (prefab default vs. hold the slot's current value), and
        // only the panel knows which branch it is on.
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

      case "interlude": {
        // Native port: Torappu.AVG.AVGCharacterCutinPanel._ExecuteInterlude and
        // _GenCutinParamWithCommand. Validation uses default 0, while CutinParam
        // [uses -1]. 2.7.61 adds `icharpos`/`icharscale`: non-empty vectors go
        // through _EnsureDialogExtra into CutinParam.extra.dialog.charPos/
        // charScale (consumed by the new CutinTemplateDialogView template).
        const checkedChannel = Math.trunc(
          toNumber(this.exactArg(args, "channel"), 0),
        );
        if (checkedChannel < 0) {
          this.warn(
            "invalid_parameter",
            `interlude channel is invalid: ${checkedChannel}`,
          );
          return "continue";
        }

        const channelArg = this.exactArg(args, "channel");
        const channel =
          channelArg === undefined ? -1 : Math.trunc(toNumber(channelArg, -1));
        const type = parseInterludeType(this.exactArg(args, "type"));
        const name = toString(this.exactArg(args, "name"));
        // Only type 3 goes through the AVG portrait pipeline: type 1 loads
        // from Cutin/Characters, also on a CutinTemplateDialogView
        // (_LoadPortraitImage → ResourceUrls.GetCutinCharPath).
        const avatarResolution =
          type === 3 && name ? this.resolveCharacterName(name) : null;
        if (avatarResolution?.kind === "native_throws")
          return this.warnNativeSlotThrows(name, line);
        const resolvedAvatar =
          avatarResolution?.kind === "found"
            ? avatarResolution.selection
            : null;
        if (type === 3 && name && !resolvedAvatar)
          this.warn("missing_asset", `interlude avatar: ${name}`);

        const positionFrom = parseVector2(this.exactArg(args, "pfrom"));
        const positionTo = parseVector2(this.exactArg(args, "pto"));
        const scaleFrom = parseVector2(this.exactArg(args, "sfrom"));
        const scaleTo = parseVector2(this.exactArg(args, "sto"));
        const duration = (key: string): number =>
          Math.max(
            0,
            Math.round(
              toNumber(this.exactArg(args, key), 0) *
                this.getCurrentSpeed().animateRatio *
                1000,
            ),
          );

        await this.renderer.setInterlude({
          alphaDurationMs: duration("aduration"),
          alphaFrom: toNumber(this.exactArg(args, "afrom"), -1),
          alphaTo: toNumber(this.exactArg(args, "ato"), -1),
          avatarCharacterKey: resolvedAvatar?.base,
          avatarExpression: resolvedAvatar?.expression,
          block: toBoolean(this.exactArg(args, "block"), false),
          channel,
          charName: toString(this.exactArg(args, "char")),
          clear: toBoolean(this.exactArg(args, "clear"), false),
          dialogCharPos: parseVector2(this.exactArg(args, "icharpos")),
          dialogCharScale: parseVector2(this.exactArg(args, "icharscale")),
          direction: toString(this.exactArg(args, "direction")),
          durationMs: duration("duration"),
          maskId: toString(this.exactArg(args, "maskid")),
          name,
          offset: parseVector2(this.exactArg(args, "offset")) ?? { x: 0, y: 0 },
          positionFrom: positionFrom && positionTo ? positionFrom : undefined,
          positionTo: positionFrom && positionTo ? positionTo : undefined,
          scaleDurationMs: duration("sduration"),
          scaleFrom: scaleFrom && scaleTo ? scaleFrom : undefined,
          scaleTo: scaleFrom && scaleTo ? scaleTo : undefined,
          size: parseVector2(this.exactArg(args, "size")) ?? { x: 0, y: 0 },
          slot: toString(this.exactArg(args, "slot")),
          style: Math.trunc(toNumber(this.exactArg(args, "style"), 0)),
          // Native `switch` (GetOrDefault false) only feeds the deco
          // TwoStateToggle, re-rendered on every show/update.
          switchOn: toBoolean(this.exactArg(args, "switch"), false),
          templateSizeDurationMs: duration("tsduration"),
          templateSizeFrom: parseVector2(this.exactArg(args, "tsfrom")) ?? {
            x: 0,
            y: 0,
          },
          templateSizeTo: parseVector2(this.exactArg(args, "tsto")) ?? {
            x: 0,
            y: 0,
          },
          type,
        } satisfies InterludeInput);
        return "continue";
      }

      case "animtext": {
        // Native port: Torappu.AVG.AVGDisplayableExecutor._ExecuteAnimatedText.
        const rawPosition = this.exactArg(args, "pos");
        const parsedPosition = parseVector2(rawPosition);
        if (rawPosition !== undefined && !parsedPosition)
          this.warn(
            "invalid_parameter",
            `animtext pos parse failed: ${toString(rawPosition)}`,
          );
        const position = parsedPosition ?? { x: 0, y: 0 };
        await this.renderer.setAnimText({
          block: toBoolean(this.exactArg(args, "block"), false),
          content: this.translateText(line.trailingText),
          id: toString(this.exactArg(args, "id")),
          name: toString(this.exactArg(args, "name")),
          position,
          style: toString(this.exactArg(args, "style")),
        });
        return "continue";
      }

      case "avgdisplay": {
        // Native port: Torappu.AVG.AVGDisplayableExecutor._ExecuteAVGDisplayable
        const optional = (key: string) =>
          toOptionalNumber(this.exactArg(args, key));
        const style = resolveAvgDisplayStyle(
          toString(this.exactArg(args, "style")),
        );
        const slot = resolveAvgDisplaySlot(
          toString(this.exactArg(args, "slot")),
        );
        // All three avgdisplay features read the same `duration` key and each
        // scales it through CalculateFadetime.
        const durationMs = this.calculateFadeMs(
          this.exactArg(args, "duration"),
          style === "bg" ? 0.1 : 0,
        );
        await this.renderer.setAvgDisplay({
          alphaFrom: optional("afrom"),
          alphaTo: optional("ato"),
          block:
            durationMs > 0 && toBoolean(this.exactArg(args, "block"), false),
          durationMs,
          entryFrom: optional("entryfrom"),
          entryIndex: Math.trunc(
            toNumber(this.exactArg(args, "entryindex"), 0),
          ),
          entryTo: optional("entryto"),
          id: toString(this.exactArg(args, "id")),
          layer: Math.trunc(toNumber(this.exactArg(args, "layer"), 1)),
          name: toString(this.exactArg(args, "name")),
          rotationX: toNumber(this.exactArg(args, "rox"), 0),
          rotationY: toNumber(this.exactArg(args, "roy"), 0),
          rotationZ: toNumber(this.exactArg(args, "roz"), 0),
          scaleX: optional("scalex"),
          scaleXFrom: optional("scalexfrom"),
          scaleXTo: optional("scalexto"),
          scaleY: optional("scaley"),
          scaleYFrom: optional("scaleyfrom"),
          scaleYTo: optional("scaleyto"),
          slot,
          style,
          x: optional("x"),
          xFrom: optional("xfrom"),
          xTo: optional("xto"),
          y: optional("y"),
          yFrom: optional("yfrom"),
          yTo: optional("yto"),
        } satisfies AvgDisplayInput);
        return "continue";
      }

      case "playmusic": {
        // Native port: Torappu.AVG.CommonExecutors._ExecutePlayMusicCommand.
        // The audio backend retires the current MUSIC channel before loading
        // the requested asset, including when its key cannot be resolved.
        const key = toString(this.exactArg(args, "key"));
        if (!key) this.warn("parse", "playmusic key is empty");
        else if (!this.hasAudioKey(key))
          this.warn("missing_asset", `music: ${key}`);

        const intro = toString(this.exactArg(args, "intro")) || undefined;
        if (intro && !this.hasAudioKey(intro))
          this.warn("missing_asset", `music intro: ${intro}`);

        void this.audio.playMusic({
          crossfadeMs: Math.max(
            0,
            toNumber(this.exactArg(args, "crossfade"), 0.4) * 1000,
          ),
          delayMs: Math.max(
            0,
            toNumber(this.exactArg(args, "delay"), 0) * 1000,
          ),
          intro,
          key,
          volume: toNumber(this.exactArg(args, "volume"), 1),
        });
        return "continue";
      }

      case "stopmusic": {
        // Native port: Torappu.AVG.CommonExecutors._ExecuteStopMusicCommand.
        void this.audio.stopMusic(
          Math.max(0, toNumber(this.exactArg(args, "fadetime"), 0) * 1000),
        );
        return "continue";
      }

      case "musicvolume": {
        // Native port: Torappu.AVG.CommonExecutors._ExecuteMusicVolumeCommand.
        void this.audio.setMusicVolume(
          toNumber(this.exactArg(args, "volume"), 1),
          Math.max(0, toNumber(this.exactArg(args, "fadetime"), 0) * 1000),
        );
        return "continue";
      }

      case "playsound": {
        // Native port: Torappu.AVG.CommonExecutors._ExecutePlaySoundCommand.
        // Channel defaults to key; the call is non-blocking. Native also
        // suppresses one-shots in Reader/Pure mode. This player runs Normal mode.
        const key = toString(this.exactArg(args, "key"));
        if (!key) {
          this.warn("parse", "playsound key is empty");
          return "continue";
        }
        if (!this.hasAudioKey(key)) {
          this.warn("missing_asset", `sound: ${key}`);
          return "continue";
        }

        void this.audio.playSound({
          channel: toString(this.exactArg(args, "channel"), key),
          delayMs: Math.max(
            0,
            toNumber(this.exactArg(args, "delay"), 0) * 1000,
          ),
          key,
          loop: toBoolean(this.exactArg(args, "loop"), false),
          volume: toNumber(this.exactArg(args, "volume"), 1),
        });
        return "continue";
      }

      case "stopsound": {
        // Native port: Torappu.AVG.CommonExecutors._ExecuteStopSoundCommand.
        const key = toString(this.exactArg(args, "key"));
        void this.audio.stopSound(
          toString(this.exactArg(args, "channel"), key),
          Math.max(0, toNumber(this.exactArg(args, "fadetime"), 0) * 1000),
        );
        return "continue";
      }

      case "soundvolume": {
        // Native port: Torappu.AVG.CommonExecutors._ExecuteSoundVolumeCommand.
        void this.audio.setSoundVolume(
          toString(this.exactArg(args, "channel")),
          toNumber(this.exactArg(args, "volume"), 1),
          Math.max(0, toNumber(this.exactArg(args, "fadetime"), 0) * 1000),
        );
        return "continue";
      }

      case "cameraeffect": {
        // Native port: Torappu.AVG.AVGCameraEffect._ExecuteCameraEffect
        // (2.7.61 VA 0x183E32560): case-sensitive Grayscale/Colorinverse
        // dispatch. Chaos is intentionally unimplemented and degraded to a
        // warning upstream (see setCameraEffect's port-scope note).
        const effect = toString(this.exactArg(args, "effect"));
        const block = toBoolean(this.exactArg(args, "block"), false);
        const keep = toBoolean(this.exactArg(args, "keep"), false);
        // AVGCameraEffect._defaultFadetime is serialized as 0.4 on
        // AVGController > AVGCamera_Scene; a 0 default would make every
        // fadetime-less cameraeffect invisible.
        // Native scales the raw seconds by AVGController.animateRatio
        // (0x183E327C1) before tweening; apply the same current-speed ratio
        // as `delay` and `calculateFadeMs` (button_auto keeps 1, quick_play
        // collapses tweens to instant).
        const fadeMs = Math.max(
          0,
          toNumber(this.exactArg(args, "fadetime"), 0.4) *
            this.getCurrentSpeed().animateRatio *
            1000,
        );
        if (effect === "Chaos") {
          this.warn("unsupported_visual", "cameraeffect:Chaos");
          return "continue";
        }
        if (effect === "Colorinverse") {
          await this.renderer.setCameraEffect(
            effect,
            keep ? 1 : 0,
            0,
            false,
            true,
          );
          return "continue";
        }
        if (effect !== "Grayscale") return "continue";
        await this.renderer.setCameraEffect(
          effect,
          toNumber(this.exactArg(args, "amount"), 1),
          fadeMs,
          block,
          keep,
          toOptionalNumber(this.exactArg(args, "initamount")),
        );
        return "continue";
      }

      case "camerashake": {
        // Native port: Torappu.AVG.AVGCameraEffect._ExecuteCameraShake. Duration
        // defaults to -1 and falls back to 10s with infinite loops; `fadetime`
        // is never read. Duration is scaled by AVGController.animateRatio
        // before anything else (2.7.61 GameAssembly @ 0x183E32E52): the scaled
        // value drives the loops sign test (scaled >= 0 ? 1 : -1), the 10.0s
        // fallback, and DOTween's waypoint count. Native then short-circuits on
        // MathUtil.IsZero(scaled) (0x183E32EFD), so quick-play speeds
        // (animateRatio = 0) skip the shake entirely; the renderer's
        // durationMs <= 0 skip reproduces that without blocking.
        const scaledDuration =
          toNumber(this.exactArg(args, "duration"), -1) *
          this.getCurrentSpeed().animateRatio;
        await this.renderer.shakeCamera({
          block: toBoolean(this.exactArg(args, "block"), false),
          durationMs:
            scaledDuration < 0 ? 10_000 : Math.max(0, scaledDuration * 1000),
          fadeOut: toBoolean(this.exactArg(args, "fadeout"), false),
          infinite: scaledDuration < 0,
          randomness: toNumber(this.exactArg(args, "randomness"), 90),
          stop: toBoolean(this.exactArg(args, "stop"), false),
          vibrato: Math.trunc(toNumber(this.exactArg(args, "vibrato"), 10)),
          xStrength: toNumber(this.exactArg(args, "xstrength"), 1),
          yStrength: toNumber(this.exactArg(args, "ystrength"), 0),
        });
        return "continue";
      }

      case "focusout": {
        // Native port: Torappu.AVG.AVGCameraEffect._ExecuteFocusout. Its
        // duration is passed through unscaled -- the executor's refs contain
        // neither get_animateRatio nor CalculateFadetime, so focusout belongs
        // to the "bypass" family and fast-forward tiers do not shorten its
        // tween or block wait (unlike calculateFadeMs-based commands). A
        // `from >= 0` does a zero-duration UpdateEffect before the real
        // tween, and `block` only gates the command when duration > 0.
        const durationMs = Math.max(
          0,
          toNumber(this.exactArg(args, "duration"), 0) * 1000,
        );
        const from = toOptionalNumber(this.exactArg(args, "from"));
        await this.renderer.setFocusOut({
          block:
            durationMs > 0 && toBoolean(this.exactArg(args, "block"), false),
          durationMs,
          from: from !== undefined && from >= 0 ? from : undefined,
          id: toString(this.exactArg(args, "id")),
          to: toNumber(this.exactArg(args, "to"), 0),
          type: toString(this.exactArg(args, "type")),
        });
        return "continue";
      }

      case "focusparam": {
        // Native port: Torappu.AVG.AVGCameraEffect._ExecuteFocusParam. This
        // is a config-only write: it sets useBlur / color on the shared
        // AVGSceneFocusOut Config and marks the command buffer dirty
        // (MarkEffectImplConfigDirty). It never touches channel amounts and
        // never blocks -- the executor always returns false.
        const effect = toString(this.exactArg(args, "effect"));
        this.renderer.setFocusParam({
          blur: toBoolean(this.exactArg(args, "blur"), true),
          color:
            effect === "Grayscale" || effect === "Colorinverse"
              ? effect
              : "None",
        });
        return "continue";
      }

      case "subtitle": {
        // Native port: Torappu.AVG.SubtitlePanel._ExecuteSubtitle. The script's
        // `delay` parameter is ignored; typing speed is global.
        const text = this.translateText(toString(this.exactArg(args, "text")));

        if (!text) {
          void this.renderer.clearSubtitle(150);
          return "continue";
        }

        const x = toNumber(this.exactArg(args, "x"), 0);
        const y = toNumber(this.exactArg(args, "y"), 0);
        if (x < 0 || x > 1280 || y < 0 || y > 720) return "continue";

        this.displayedLineIndex = line.lineNumber;
        // Native _OnTypeWriterEnd (2.7.61 VA 0x183e94e80) raises the auto
        // click with the subtitle's own raw typeWriter.messageLength.
        const onTypingComplete = this.beginTextTyping(text.length);
        await this.renderer.setSubtitle({
          alignment:
            parseSubtitleAlignment(this.exactArg(args, "alignment")) ?? "left",
          delayMs: this.getCurrentSpeed().typeWriterDelayMs,
          onTypingComplete,
          sizePx: toNumber(this.exactArg(args, "size"), 24),
          text,
          widthPx: Math.min(
            toNumber(this.exactArg(args, "width"), 1280),
            1280 - x,
          ),
          x,
          y,
        } satisfies SubtitleInput);
        return "wait_input";
      }

      case "spellsticker": {
        // Native port: Torappu.AVG.AVGSpellStickerPanel._ExecuteSpellSticker.
        // `block` waits for a click, whose follow-up hides the sticker.
        const id = toString(this.exactArg(args, "id"));
        if (!id) {
          // Native logs "[AVG.SpellSticker] Empty sticker id." and returns
          // false before reading `block`: nothing renders and nothing blocks.
          this.warn("parse", "spellsticker id is empty");
          return "continue";
        }
        const action = toString(this.exactArg(args, "action"), "show");
        const block = toBoolean(this.exactArg(args, "block"), false);
        // Native `_ShowSticker` inlines `_ApplyAlpha`: CanvasGroup.alpha is
        // only written when the alpha param exists (TryGetParam + clamp 0..1),
        // so a reused sticker keeps its previous alpha. Keep the field
        // optional instead of forcing the default 1.
        const alpha = toOptionalNumber(this.exactArg(args, "alpha"));
        await (action.toLowerCase() === "hide"
          ? this.renderer.hideSpellSticker(id)
          : this.renderer.setSpellSticker({
              alpha: alpha === undefined ? undefined : clamp(alpha, 0, 1),
              angle: toOptionalNumber(this.exactArg(args, "angle")),
              content: this.translateText(line.content),
              id,
              style: toString(this.exactArg(args, "style"), "sami"),
              x: toOptionalNumber(this.exactArg(args, "x")),
              xScale: toOptionalNumber(this.exactArg(args, "xScale")),
              y: toOptionalNumber(this.exactArg(args, "y")),
              yScale: toOptionalNumber(this.exactArg(args, "yScale")),
            } satisfies SpellStickerInput));
        if (block) {
          this.pendingInputEffect =
            action.toLowerCase() === "hide"
              ? null
              : () => this.renderer.hideSpellSticker(id);
          return "wait_input";
        }
        return "continue";
      }

      case "spellstickerclear": {
        // Native port: Torappu.AVG.AVGSpellStickerPanel._ExecuteSpellStickerClear.
        await this.renderer.clearSpellStickers();
        this.pendingInputEffect = null;
        return toBoolean(this.exactArg(args, "block"), false)
          ? "wait_input"
          : "continue";
      }

      case "theater": {
        // Native port: Torappu.AVG.AVGTheaterLabel._ExecuteTheaterNode. Web adapts
        // the native theater UI mode to autoplay state only.
        // AVGController.SetTheaterMode gates only on get_isRunning, so both
        // branches of _SetTheaterModeStatus (2.7.81 VA 0x183f92420) run
        // whether or not theater mode is already active.
        const mode = toBoolean(this.exactArg(args, "mode"), true);
        if (mode) {
          // _SaveAutoStatus runs on every enter: a nested [theater] re-saves
          // the theater's own button auto, so the exit then stays in auto.
          this.theaterAutoPlayCache = this.getAutoPlayState();
          this.theaterMode = true;
          this.buttonSpeedLevel = 0;
          this.applyScriptAutoPlayMode("button_auto");
        } else {
          // _StopAutoClick() on every exit, then restore the saved status
          // (m_needResumeAutoStatus; QUICK_PLAY maps to DEFAULT) or, with
          // nothing saved, set_autoPlayMode(DEFAULT): an unpaired exit drops
          // a running auto play to manual. The cache outliving a SkipToThis
          // jump is covered in skipNode().
          this.cancelAutoClick();
          const cached = this.theaterAutoPlayCache;
          this.theaterMode = false;
          this.theaterAutoPlayCache = null;
          let restoreMode: AutoPlayMode = "default";
          if (cached) {
            this.buttonSpeedLevel = cached.buttonSpeedLevel;
            this.quickSpeedLevel = cached.quickSpeedLevel;
            if (cached.mode !== "quick_play") restoreMode = cached.mode;
          }
          this.applyScriptAutoPlayMode(restoreMode);
        }
        return "continue";
      }

      case "decision": {
        // Native port: Torappu.AVG.DecisionPanel._ExecuteDecision. Selection
        // writes a value for the command-loop predicate gate; it is not a
        // label jump.
        // 有意省略：native 在 autoPlayMode==QUICK_PLAY 且设置项
        // AVG_SKIP_DECISION 开启时会 _SetOptionButtonSelect(0) 自动选第
        // 0 项、不阻塞（0x183e70f9d-0x183e71013）；web 没有游戏内设置
        // 项，按 AVG_SKIP_DECISION 恒为关处理，总是阻塞等点击。等待期间
        // 把 autoPlayMode 降级为 default、选择后恢复，也是 web 适配
        // （native 不降级）。
        this.decisionSelectValue = 0;
        this.decisionReferences = null;
        // options/values 的解析与 Log All 共用 log/semantics.parseDecision，
        // 缺项 value 按原生 `_GetOptionValue` 取 0（闸门对 0 恒放行）；
        // `&` 禁用前缀同样在 parseDecision 剥离并标记 disabled。
        const parsed = parseDecision(line, this.context.audioVariables);
        if (!parsed) {
          // 无效 decision 同样先重置 value/references 并切回手动（原生
          // 在校验 options 之前就重置：DecisionPanel._ExecuteDecision 在
          // TryGetParam("options") 之前写 _decisionValue/_referenceValues）
          // native 对缺 options 是阻塞语义：LogError "[AVG] No options
          // parameter for Decision command" 后 return true（面板已激活，
          // 主播放路径实际卡死，现网脚本不会出现）。web 取容错放行：
          // 上面的重置已清空分支状态，warn 后继续播。
          this.applyScriptAutoPlayMode("default");
          this.warn(
            "invalid_parameter",
            "decision options parameter is missing",
          );
          return "continue";
        }

        const options = parsed.options.map((option) => option.label);
        const values = parsed.options.map((option) => option.value);
        const disabled = parsed.options.map((option) => option.disabled);
        if (options.length > DECISION_OPTION_CAPACITY) {
          this.warn(
            "invalid_parameter",
            `too many decision options: ${options.length} > native capacity ${DECISION_OPTION_CAPACITY}`,
            line.lineNumber,
            "decision",
          );
        }

        // Web 调试适配：注入的 decision policy 直接替玩家选择，跳过面板
        // 等待（无原生对应）。选择历史与 value 写入和面板路径完全一致；
        // 命中时不翻转自动播放模式，否则快速播放会在第一个 decision
        // 处被切回手动。
        const policyPick = this.decisionPolicy?.({
          decisionId: line.lineNumber,
          options,
          values,
        });
        if (
          policyPick !== null &&
          policyPick !== undefined &&
          Number.isSafeInteger(policyPick) &&
          policyPick >= 0 &&
          policyPick < options.length
        ) {
          const value = values[policyPick] ?? 0;
          this.decisionSelectValue = value;
          this.choiceHistory.push({
            decisionId: line.lineNumber,
            optionIndex: policyPick,
            value,
          });
          return "continue";
        }

        // 面板阻塞等点击，模式在下面原样还回去（skip 的 SkipToThis 路径
        // 会改写还原目标），跳转不受影响
        const pendingDecision = { autoPlayRestore: this.autoPlayMode };
        this.pendingDecision = pendingDecision;
        this.applyAutoPlayMode("default");
        this.state = "waiting_decision";
        const selection = await this.renderer.showDecision(
          options,
          values,
          disabled,
        );
        if (this.pendingDecision === pendingDecision)
          this.pendingDecision = null;
        this.decisionSelectValue = selection.value;
        // 点击下标由 renderer 直接返回：value 可能在 options 间重复
        // （显式值相同，或与缺省值 0 碰撞），反查会记错选项，
        // Log All 的路径求值与高亮都依赖 optionIndex。
        // optionIndex < 0 表示面板未经点击被清除（销毁/顶替），此时
        // decisionSelectValue 仍是 0（闸门全开），不能记成「选了第 1 项」。
        if (selection.optionIndex >= 0)
          this.choiceHistory.push({
            decisionId: line.lineNumber,
            optionIndex: selection.optionIndex,
            value: selection.value,
          });
        this.applyAutoPlayMode(pendingDecision.autoPlayRestore);
        this.state = "running";
        return "continue";
      }

      case "predicate": {
        // Native port: Torappu.AVG.DecisionPanel._ExecutePredicate. This ghost
        // command only replaces the current reference-value gate.
        this.decisionReferences = parsePredicateReferences(line);
        return "continue";
      }

      default: {
        if (unsupportedAd8Commands.has(line.command)) {
          this.warn("unsupported_command", line.command);
          return "continue";
        }

        this.warn("unknown_command", line.command);
        return "continue";
      }
    }
  }

  private translateText(text: string): string {
    return expandStoryText(text, this.context.audioVariables);
  }

  private prepareEndtip(): boolean {
    // Native port: AVGStoryCache.shouldProcessEndtip (2791 @ 0x1841B84B0).
    if (
      this.autoPlayMode === "default" ||
      this.context.storyMetadata?.isVideoOnly
    )
      return false;
    // Web line seeks end as missed here before the native mode reset.
    this.finishLineSeekMissed("finished");
    this.applyAutoPlayMode("default");
    return true;
  }

  private onTypingComplete(): void {
    this.currentTypingComplete = true;
    this.scheduleAutoClick(this.currentRawMessageLength);
  }

  /**
   * Web adaptation of AVGController.RaiseAutoClick: the latest text command
   * owns the wait. Its typewriter reports completion with the raw length,
   * and a stale callback from a replaced text view cannot reschedule it.
   */
  private beginTextTyping(messageLength: number): () => void {
    this.cancelTextTyping();
    this.currentRawMessageLength = messageLength;
    const generation = this.textTypingGeneration;
    return () => {
      if (!this.destroyed && this.textTypingGeneration === generation)
        this.onTypingComplete();
    };
  }

  /**
   * Native port: the sticker hide branch ends with `_OnStickerTypeEnd(0)`,
   * i.e. `AVGController.RaiseAutoClick(0)` (2791 `_HideSticker` 0x1841E4250):
   * the hidden sticker drops the shared typing state and auto-play moves on
   * with the base wait only.
   */
  private raiseStickerAutoClick(): void {
    this.cancelTextTyping();
    this.currentRawMessageLength = 0;
    if (!this.destroyed) this.onTypingComplete();
  }

  private cancelTextTyping(): void {
    this.textTypingGeneration += 1;
    this.currentTypingComplete = false;
    this.cancelAutoClick();
  }

  private parseEnterDirection(value: unknown): CharacterSlotInput["enterFrom"] {
    // Native compares the raw string ordinally against the four literals
    // left/right/up/down; anything else (including "middle") means no enter.
    const raw = toString(value);
    if (raw === "left" || raw === "right" || raw === "up" || raw === "down")
      return raw;
    return undefined;
  }

  private parseScreenAdapt(value: unknown): BackgroundInput["screenAdapt"] {
    const mode = toString(value);
    if (
      mode === "coverall" ||
      mode === "fill" ||
      mode === "height" ||
      mode === "showall" ||
      mode === "width"
    )
      return mode;
    return undefined;
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
    // `_ProcessFocusArray` (2.7.61, VA 0x183e50b30) recognizes only
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
    // String.op_Equality (ordinal; 2.7.81 @ 0x183fd6c90) — "MOVE" is an
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
    // _GenExitPosition (2.7.81 @ 0x183fd8980) recognizes exactly
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
