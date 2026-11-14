import mitt, { type Handler } from "mitt";

import { DecisionCommandPredicator } from "./DecisionCommandPredicator";
import { resolveStoryAudioByKey, resolveStoryVideoByKey } from "./asset";
import {
  type CharacterRefResolution,
  nativeCharacterFadeIdentity,
  resolveCharacterRef,
} from "./characterRef";
import {
  exactArg,
  parseVector2,
  roundHalfToEven,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
} from "./commandParams";
import {
  CommandRegistry,
  type ClickCompletion,
  type CommandResult,
  type CommandWait,
  type WaitForClick,
  type WaitForDecision,
  type WaitForFrame,
} from "./commandRegistry";
import { AVGEvent, EventPool } from "./eventPool";
import { createExecutionHandle, type ExecutionHandle } from "./execution";
import { CameraEffectExecutor } from "./panels/CameraEffectExecutor";
import { CgItemPanel } from "./panels/CgItemPanel";
import { DecisionPanel } from "./panels/DecisionPanel";
import { DialogPanel } from "./panels/DialogPanel";
import { DisplayableExecutor } from "./panels/DisplayableExecutor";
import { ShowItemPanel } from "./panels/ShowItemPanel";
import { SpellStickerPanel } from "./panels/SpellStickerPanel";
import { StickerPanel } from "./panels/StickerPanel";
import { SubtitlePanel } from "./panels/SubtitlePanel";
import { parseScript } from "./parser";
import { expandStoryText } from "./textVariables";

import type { Context } from "../context";
import type {
  AutoPlayMode,
  AutoPlayState,
  BackgroundInput,
  CharacterActionInput,
  CharacterSlotInput,
  DecisionPolicy,
  InterludeElementType,
  InterludeInput,
  LineSeekUpdate,
  ParsedCommandLine,
  PlayerState,
  RuntimeLogPosition,
  RuntimeOptions,
  RuntimeWarning,
  StoryAudio,
  StoryCommandArgs,
  StoryPlayerEvents,
  StoryRenderer,
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
  "playmusic",
  "stopmusic",
  "musicvolume",
  "playsound",
  "stopsound",
  "soundvolume",
  "theater",
  "bgeffect",
  "effect",
] as const;

const unsupportedAd8Commands = new Set(["bgeffect", "effect"]);

interface PendingFrameWait {
  waits: readonly WaitForFrame[];
  resume: () => Promise<void>;
  resolve: (continuation?: Promise<void>) => void;
}

interface PendingInput {
  dispatching: boolean;
  effects: ClickCompletion[];
  handlers: readonly WaitForClick[];
  subscriptions: Set<() => void>;
}

interface PendingAutoClick {
  deadlineMs?: number;
  delayMs: number;
  phase: "awaiting_mode" | "timing" | "elapsed";
}

function delayWait(delayMs: number): WaitForFrame {
  let deadlineMs: number | undefined;
  return {
    // WaitForSecondsRealtime initializes the deadline on its first poll.
    isComplete: (nowMs) => nowMs >= (deadlineMs ??= nowMs + delayMs),
  };
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

export class StoryRuntime {
  private readonly audio: StoryAudio;
  private readonly defaultSpeed: AutoSpeed;
  private autoPlayMode: AutoPlayMode = "default";
  private pendingAutoClick: PendingAutoClick | null = null;
  private stopFramePolling: (() => void) | null = null;
  private buttonSpeedLevel = 0;
  private readonly commandRegistry = new CommandRegistry<CommandResult>();
  private readonly eventPool = new EventPool<AVGEvent>();
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
  private readonly decisionPredicator = new DecisionCommandPredicator();
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
  private destroyed = false;
  private readonly lines: ReturnType<typeof parseScript>;
  private readonly firstRead: boolean;
  private processing = false;
  private processingCompletion: Promise<void> | null = null;
  private resolveProcessingCompletion: (() => void) | null = null;
  private readonly renderer: StoryRenderer;
  private currentSkipMode: SkipMode = "skip";
  private skipCleanup: ExecutionHandle | null = null;
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
  private theaterMode = false;
  private theaterAutoPlayCache: AutoPlayState | null = null;
  private playbackGeneration = 0;
  private quickSpeedLevel = 0;
  private state: PlayerState = "idle";
  private readonly decisionPanel: DecisionPanel;
  private readonly dialogPanel: DialogPanel;
  private readonly displayableExecutor: DisplayableExecutor;
  private readonly showItemPanel: ShowItemPanel;
  private readonly spellStickerPanel: SpellStickerPanel;
  private readonly stickerPanel: StickerPanel;
  private readonly subtitlePanel: SubtitlePanel;
  private pendingFrameWait: PendingFrameWait | null = null;
  private pendingInput: PendingInput | null = null;
  private resumeCommands: (() => void) | null = null;

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
    this.skipNodeLabels = preprocessSkipNodes(this.lines);
    this.skipToIndex = preprocessSkipToIndex(this.lines);
    this.labelMap = preprocessLabelMap(this.lines);
    this.onWarning = options.onWarning;
    this.decisionPanel = new DecisionPanel(
      this.decisionPredicator,
      renderer,
      context,
      {
        pickOption: (decision) => this.decisionPolicy?.(decision) ?? null,
        resetAutoPlayMode: () => this.applyScriptAutoPlayMode("default"),
        warnInvalidParameter: (detail, line) =>
          this.warn(
            "invalid_parameter",
            detail,
            line?.lineNumber,
            line?.command,
          ),
      },
    );
    this.dialogPanel = new DialogPanel(renderer, {
      beginTyping: (length) => this.beginTextTyping(length),
      prepareEndtip: () => this.prepareEndtip(),
      setDisplayedLine: (lineNumber) => {
        this.displayedLineIndex = lineNumber;
      },
      translateText: (text) => this.translateText(text),
      typeWriterDelayMs: () => this.getCurrentSpeed().typeWriterDelayMs,
    });
    this.displayableExecutor = new DisplayableExecutor(renderer, {
      calculateFadeMs: (seconds, fallback) =>
        this.calculateFadeMs(seconds, fallback),
      translateText: (text) => this.translateText(text),
      warnInvalidParameter: (detail) => this.warn("invalid_parameter", detail),
    });
    this.showItemPanel = new ShowItemPanel(renderer, {
      resolveImageKey: (key) => this.resolveImageKey(key),
      warnInvalidParameter: (detail, line) =>
        this.warn("invalid_parameter", detail, line.lineNumber, line.command),
    });
    this.spellStickerPanel = new SpellStickerPanel(renderer, {
      scheduleAutoClick: (delayMs) => this.scheduleAutoClick(delayMs),
      translateText: (text) => this.translateText(text),
      warn: (detail) => this.warn("parse", detail),
    });
    this.stickerPanel = new StickerPanel(renderer, {
      animateRatio: () => this.getCurrentSpeed().animateRatio,
      beginTyping: (length) => this.beginTextTyping(length),
      typeWriterDelayMs: () => this.getCurrentSpeed().typeWriterDelayMs,
      translateText: (text) => this.translateText(text),
      warn: (detail) => this.warn("parse", detail),
    });
    this.subtitlePanel = new SubtitlePanel(renderer, {
      beginTyping: (length) => this.beginTextTyping(length),
      setDisplayedLine: (lineNumber) => {
        const generation = this.playbackGeneration;
        this.displayedLineIndex = lineNumber;
        return !this.destroyed && generation === this.playbackGeneration;
      },
      translateText: (text) => this.translateText(text),
      typeWriterDelayMs: () => this.getCurrentSpeed().typeWriterDelayMs,
    });
    new CameraEffectExecutor(renderer, {
      animateRatio: () => this.getCurrentSpeed().animateRatio,
      calculateFadeMs: (seconds, fallback) =>
        this.calculateFadeMs(seconds, fallback),
      warnUnsupportedVisual: (detail) =>
        this.warn("unsupported_visual", detail),
    }).register(this.commandRegistry);
    new CgItemPanel(renderer, {
      animateRatio: () => this.getCurrentSpeed().animateRatio,
      resolveImageKey: (key) => this.resolveImageKey(key),
      warn: (type, detail) => this.warn(type, detail),
    }).register(this.commandRegistry);
    this.decisionPanel.register(this.commandRegistry);
    this.dialogPanel.register(this.commandRegistry);
    this.displayableExecutor.register(this.commandRegistry);
    this.showItemPanel.register(this.commandRegistry);
    this.spellStickerPanel.register(this.commandRegistry);
    this.stickerPanel.register(this.commandRegistry);
    this.subtitlePanel.register(this.commandRegistry);
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
    return this.decisionPredicator.decisionValue;
  }

  getLogPosition(): RuntimeLogPosition {
    return {
      lineIndex: this.displayedLineIndex,
      selections: this.decisionPredicator.getSelections(),
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
    // Select the gear before QUICK_PLAY emits its immediate click. That
    // click can finish typing and capture the current gear's auto delay.
    this.quickSpeedLevel = QUICK_AUTO_SPEEDS.length - 1;
    this.applyAutoPlayMode("quick_play");
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

    // 模式以本次调用为准，不再改
    if (mode !== this.autoPlayMode && mode !== "quick_play" && this.lineSeek)
      this.closeLineSeek({
        phase: "aborted",
        target: this.lineSeek.target,
      });

    this.applyAutoPlayMode(mode);
  }

  /** 写入模式并广播速度变化。自动点击在 Update 后读取模式。 */
  private applyAutoPlayMode(mode: AutoPlayMode): void {
    if (this.destroyed || this.state === "finished" || this.state === "error")
      return;

    this.autoPlayMode = mode;
    // set_autoPlayMode (2791 @ 0x184175100) emits a click on every QUICK_PLAY
    // assignment before broadcasting the cache.
    if (mode === "quick_play") void this.advanceFromClick();
    // Setting DEFAULT again on a manual press still runs
    // _UpdateAutoPlayModeUI and emits ON_SPEED_SET.
    this.eventPool.emit(AVGEvent.SpeedSet);
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
    if (this.autoPlayMode === "quick_play") {
      const quickLevel = Math.min(normalized, QUICK_AUTO_SPEEDS.length - 1);
      // AVGQuickPlayBtn.OnClick (2791 @ 0x1841AEB60) ignores the active gear.
      if (quickLevel === this.quickSpeedLevel) return;
      this.quickSpeedLevel = quickLevel;
    } else {
      this.buttonSpeedLevel = Math.min(
        normalized,
        BUTTON_AUTO_SPEEDS.length - 1,
      );
    }

    // 2791 emits ON_SPEED_SET on both speed buttons: OnSpeedBtnClicked for
    // button auto, and AVGQuickPlayBtn.OnClick -> SetQuickSpeed ->
    // AVGQuickPlay._SetSpeedBtn for quick play.
    this.eventPool.emit(AVGEvent.SpeedSet);
  }

  canSkipNode(): boolean {
    const running =
      this.skipCleanup === null &&
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

    this.dialogPanel.onStoryBegin(this.eventPool);
    this.stickerPanel.onStoryBegin(this.eventPool);
    this.subtitlePanel.onStoryBegin(this.eventPool);
    this.stopFramePolling = this.renderer.onFrameUpdate(
      ({ nowMs }) => this.pollAfterUpdate(nowMs),
      "afterUpdate",
    );
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

  /**
   * Native executors listen to ON_CLICK until FinishCommand. Bind the Web
   * executor callbacks after dispatch so a stale async result cannot leave
   * behind a listener when a skip moved the cursor.
   */
  private waitForInput(handlers: readonly WaitForClick[]): void {
    const pending: PendingInput = {
      dispatching: false,
      effects: [],
      handlers,
      subscriptions: new Set(),
    };
    for (const { handleClick } of handlers) {
      const unsubscribe = this.eventPool.on(AVGEvent.Click, () => {
        if (this.pendingInput !== pending) return;
        handleClick((completion) => {
          if (
            this.pendingInput !== pending ||
            !pending.subscriptions.delete(unsubscribe)
          )
            return;
          unsubscribe();
          if (completion) pending.effects.push(completion);
        });
      });
      pending.subscriptions.add(unsubscribe);
    }
    this.pendingInput = pending;
    this.state = "waiting_input";
  }

  private cancelInputWait(): void {
    const pending = this.pendingInput;
    this.pendingInput = null;
    this.resumeCommands = null;
    for (const unsubscribe of pending?.subscriptions ?? []) unsubscribe();
  }

  private async advanceFromClick(): Promise<void> {
    const pending = this.pendingInput;
    if (
      this.destroyed ||
      this.state !== "waiting_input" ||
      !pending ||
      pending.dispatching ||
      pending.subscriptions.size === 0
    )
      return;

    // OnClickPress and _DoAutoClick both emit ON_CLICK. A click that only
    // reveals text leaves the executor subscribed for the advancing click.
    pending.dispatching = true;
    try {
      this.eventPool.emit(AVGEvent.Click);
    } finally {
      pending.dispatching = false;
    }
    if (this.pendingInput !== pending || pending.subscriptions.size > 0) return;

    // Keep the blockers available to SkipStory until their frame-end finish.
    const generation = this.playbackGeneration;
    try {
      // SubtitlePanel._OnClicked (2791 @ 0x1841E5920) finishes at frame
      // end. Spellsticker hides on the click itself.
      for (const { onClick } of pending.effects) onClick?.();
      if (this.pendingInput !== pending) return;

      const finish = createExecutionHandle(true);
      const cancelFrameEnd = this.finishAtFrameEnd(finish, () => {
        for (const { onFinish } of pending.effects) onFinish?.();
        if (this.pendingInput === pending) this.pendingInput = null;
      });
      await this.waitForFrame(
        [
          {
            isComplete: () => finish.endReason !== undefined,
            forceEnd: () => {
              finish.end("force_end");
              cancelFrameEnd();
            },
          },
        ],
        () => {
          if (finish.failure) return Promise.reject(finish.failure.error);
          return this.processLoop();
        },
      );
    } catch (error) {
      if (!this.destroyed && generation === this.playbackGeneration)
        this.waitForInput(
          pending.handlers.map(({ forceEnd }) => ({
            forceEnd,
            handleClick: (finishCommand) => finishCommand(),
          })),
        );
      throw error;
    }
  }

  private waitForDecision(decision: WaitForDecision): Promise<void> {
    this.state = "waiting_decision";
    const finish = createExecutionHandle(true);
    let selected = false;
    let cancelFrameEnd: (() => void) | undefined;
    let open = true;
    const close = () => {
      if (!open) return;
      open = false;
      decision.closeDecision();
    };
    const completion = this.waitForFrame([
      {
        isComplete: () => {
          if (finish.failure) throw finish.failure.error;
          return finish.endReason !== undefined;
        },
        forceEnd: () => {
          finish.end("force_end");
          cancelFrameEnd?.();
          close();
        },
      },
    ]);
    try {
      decision.showDecision((selection) => {
        if (!open || selected || this.destroyed) return;
        selected = true;
        try {
          // OnDecisionSelected (2791 @ 0x184169F40) records the choice
          // immediately. InternalCommand.Finish schedules FinishCommand
          // via InvokeEndOfFrame (0x1841C7340).
          decision.applySelection(selection);
          if (!this.skipCleanup)
            cancelFrameEnd = this.finishAtFrameEnd(finish, close);
        } catch (error) {
          finish.fail(error);
        }
      });
    } catch (error) {
      finish.fail(error);
    }
    return completion;
  }

  private finishAtFrameEnd(
    handle: ExecutionHandle,
    onFinish?: () => void,
  ): () => void {
    return this.renderer.onFrameEnd(() => {
      if (handle.endReason !== undefined || this.skipCleanup || this.destroyed)
        return;
      try {
        onFinish?.();
        if (
          handle.endReason !== undefined ||
          this.skipCleanup ||
          this.destroyed
        )
          return;
        this.state = "running";
        handle.end();
      } catch (error) {
        handle.fail(error);
      }
    });
  }

  async skipNode(): Promise<void> {
    if (this.destroyed || !this.canSkipNode()) return;

    // Native port: Torappu.AVG.AVGController.OnSkipBtnClicked (2.7.61
    // 0x183e16ee0) drops the skip click entirely while autoPlayMode ==
    // QUICK_PLAY. The brief-confirm panel it shows otherwise is a native-only
    // UI that this widget intentionally omits.
    if (this.autoPlayMode === "quick_play") return;

    const activeProcessCompletion = this.processingCompletion;
    const skipToThis = this.skipToIndex >= 0;
    let shouldResume = false;

    // m_executeIndex points at the command currently being waited on while our
    // cursor already points at the next command, hence cursor <= anchorIndex is
    // the native m_executeIndex < m_skipToIndex forward-only test.
    if (skipToThis) {
      if (this.cursor > this.skipToIndex) return;
      this.cursor = this.skipToIndex + 1;
      shouldResume = true;
    } else {
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
        this.showItemPanel.reset();
      }
    }

    const interruptedInput = shouldResume ? this.pendingInput : null;
    this.cancelInputWait();
    // SkipStory (2791 @ 0x18416E560) force-ends the blockers and resets
    // components before the coroutine resumes. The StopStory path bypasses
    // these resets. Web cleanup can yield even as the old executor settles.
    const cleanup = createExecutionHandle(true);
    this.skipCleanup = cleanup;
    let resumedProcess: Promise<void> | undefined;
    try {
      try {
        // The protected skipnode branch keeps the auto-click coroutine.
        // ForceCommandEnd can replace it before the old callbacks expire.
        for (const handler of interruptedInput?.handlers ?? [])
          handler.forceEnd?.();
        // A decision can still record a selection during skip cleanup.
        if (this.state !== "waiting_decision") this.cancelFrameWait();
      } finally {
        this.playbackGeneration += 1;
        if (skipToThis) {
          // SkipStory resets the mode and story cache after ForceEnd.
          // Clear the Web theater flag first so setAutoPlayMode accepts
          // DEFAULT. The pre-theater mode cache lives outside the story cache.
          this.theaterMode = false;
          this.setAutoPlayMode("default");
          this.skipNodeQueueIndex = this.skipNodeLabels.length;
          this.currentSkipMode = "skip";
        }
        if (skipToThis || !shouldResume) this.cancelAutoClick();
      }
      if (shouldResume) {
        for (const reset of [
          // AVGCharacterCutinPanel.ShouldResetOnSkip opts both executors in.
          () => this.renderer.clearInterludes(),
          () => this.renderer.clearCharacterCutin(),
          () => this.spellStickerPanel.reset(),
          () => this.subtitlePanel.reset(),
          () => this.stickerPanel.reset(),
        ]) {
          if (this.destroyed) break;
          await reset();
        }
      }
    } finally {
      // Let the interrupted loop unwind under skipCleanup before resuming or
      // ending the story. It can still be returning from an async executor.
      this.dialogPanel.stopTypingSilently();
      this.cancelFrameWait();
      await activeProcessCompletion;
      if (shouldResume && !this.destroyed && this.state !== "error") {
        resumedProcess = this.resumeSkipOnFrame(cleanup);
      } else {
        this.skipCleanup = null;
        cleanup.end();
        if (!this.destroyed && this.state !== "error")
          await this.finishPlayback();
      }
    }
    if (resumedProcess) await resumedProcess;
  }

  private resumeSkipOnFrame(cleanup: ExecutionHandle): Promise<void> {
    return new Promise((resolve) => {
      const cancelUpdate = this.renderer.onFrameUpdate(() => {
        cancelUpdate();
        // SkipStory clears the blockers. _DoExecuteCommands.MoveNext
        // (2791 @ 0x184180280) sees that on its next poll, after Update.
        this.resumeCommands = () => {
          this.skipCleanup = null;
          cleanup.end();
          this.state = "running";
          resolve(this.processLoop());
        };
      });
      void cleanup.completion.then((reason) => {
        if (reason !== "reset") return;
        cancelUpdate();
        resolve();
      });
    });
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
    this.pendingAutoClick = null;
  }

  private scheduleAutoClick(
    delayMs = this.getCurrentSpeed().autoWaitBaseTime * 1000,
  ): void {
    if (this.destroyed || this.state === "finished" || this.state === "error")
      return;
    // RaiseAutoClick (2791 @ 0x18416C3F0) replaces the coroutine even in DEFAULT.
    this.pendingAutoClick = {
      delayMs,
      phase: "awaiting_mode",
    };
  }

  private pollAfterUpdate(nowMs: number): void {
    this.pollFrameWait(nowMs);
    const resume = this.resumeCommands;
    this.resumeCommands = null;
    resume?.();
    if (this.skipCleanup) return;

    const pending = this.pendingAutoClick;
    if (!pending) return;
    // _DoAutoClick (2791 @ 0x184180000): WaitUntil, WaitForSecondsRealtime,
    // then a separate WaitUntil. keepWaiting (0x186DE4C30) initializes the
    // real-time deadline on its first poll.
    switch (pending.phase) {
      case "awaiting_mode":
        if (this.autoPlayMode !== "default") pending.phase = "timing";
        return;
      case "timing":
        pending.deadlineMs ??= nowMs + pending.delayMs;
        if (nowMs >= pending.deadlineMs) pending.phase = "elapsed";
        return;
      case "elapsed":
        if (this.autoPlayMode === "default") return;
        this.pendingAutoClick = null;
        void this.advanceFromClick();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.skipCleanup?.end("reset");
    this.lineSeek = null;
    this.decisionPanel.destroy();
    this.dialogPanel.destroy();
    this.showItemPanel.reset();
    this.stopPlaybackInput();
    this.playbackGeneration += 1;
    // 销毁后不该再有推送落到 UI 上
    this.events.all.clear();
  }

  private stopPlaybackInput(): void {
    this.stopFramePolling?.();
    this.stopFramePolling = null;
    this.cancelInputWait();
    this.cancelFrameWait();
    // The Web runtime handles one story. Clear its story-long ON_SPEED_SET
    // subscriptions together when that story ends.
    this.eventPool.clear();
    this.dialogPanel.stopTypingSilently();
    this.subtitlePanel.stopTypingSilently();
    this.cancelAutoClick();
  }

  /**
   * Native port: AVGController.OnStoryEnd (2791 @ 0x18416B9C0) runs the
   * component resets after the command coroutine ends or SkipStory stops it.
   */
  private finishPlayback(): Promise<void> {
    this.stopPlaybackInput();
    // AVGController.OnStoryEnd (2791 @ 0x18416B9C0) calls SubtitlePanel.OnReset.
    void this.subtitlePanel.reset();
    this.displayableExecutor.reset();
    // AVGCgItemPanel.OnReset (2791 @ 0x1841890F0) disposes the slots at
    // story end. ShouldResetOnSkip keeps them alive across segment skips.
    this.renderer.resetCgItems();
    // Native end-of-story reset destroys a lingering show-item slot
    // (AVGShowItemPanel._Reset) instead of leaving the item on screen.
    this.showItemPanel.reset();
    // Native port: AVGController.OnStoryEnd (2791 VA 0x18416B9C0) calls every
    // component's OnReset once no new story is running, and
    // CommonExecutors.OnReset -> _ResetAudio (0x1841C6200) stops every SOUND
    // channel playsound started and stopsound did not explicitly stop, so an
    // unterminated loop ambience cannot outlive the story. MUSIC is global in
    // native and deliberately untouched here.
    this.audio.resetAudio();
    // OnStoryCommitted (2791 @ 0x18416B750) hides the AVG root before OnReset.
    // Recycle the ordinary sticker views immediately on the Web canvas.
    const stickerReset = this.stickerPanel.reset(0);
    this.state = "finished";
    this.finishLineSeekMissed("finished");
    return stickerReset;
  }

  private async processLoop(
    remainingWaits?: readonly CommandWait[],
  ): Promise<void> {
    if (this.processing) return;

    this.processing = true;
    this.processingCompletion = new Promise<void>((resolve) => {
      this.resolveProcessingCompletion = resolve;
    });

    try {
      while (!this.destroyed) {
        if (this.skipCleanup)
          return this.skipCleanup.completion.then(() => undefined);

        if (remainingWaits) {
          const decision = remainingWaits.find(
            (wait) => "showDecision" in wait,
          );
          if (decision) return this.waitForDecision(decision);
          const clicks = remainingWaits.filter((wait) => "handleClick" in wait);
          if (clicks.length) {
            this.waitForInput(clicks);
            return;
          }
          remainingWaits = undefined;
        }

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
          // _DoExecuteCommands.MoveNext (2791 @ 0x184180CA6) yields
          // WaitForSecondsRealtime(0.2) before DoEndStory.
          this.state = "waiting_timer";
          return this.waitForFrame([delayWait(200)], () =>
            this.finishPlayback(),
          ).catch((error: unknown) => this.failPlayback(error));
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
            await this.finishPlayback();
            return;
          }
        }

        const line = this.lines[this.cursor];
        this.cursor += 1;

        if (!this.decisionPredicator.needToExecuteCommand(line)) continue;

        const generation = this.playbackGeneration;
        const isCurrent = () =>
          !this.destroyed && generation === this.playbackGeneration;
        const execution =
          line.kind === "command"
            ? this.executeCommand(line, isCurrent)
            : this.dialogPanel.executeTextLine(line, isCurrent);
        const result =
          execution instanceof Promise ? await execution : execution;
        if (this.destroyed) return;
        // A skipped executor can still return a stale input wait. Its click
        // follow-up (spellsticker block) travels with the dropped handler.
        if (!isCurrent()) continue;
        if (result === "continue") continue;

        const waits = Array.isArray(result) ? result : [result];
        const frameWaits = waits.filter((wait) => "isComplete" in wait);
        const followUp = waits.filter((wait) => !("isComplete" in wait));
        if (frameWaits.length > 0)
          return this.waitForFrame(frameWaits, () =>
            this.processLoop(followUp),
          );
        remainingWaits = followUp;
      }
    } catch (error) {
      this.failPlayback(error);
    } finally {
      this.processing = false;
      this.resolveProcessingCompletion?.();
      this.resolveProcessingCompletion = null;
      this.processingCompletion = null;
    }
  }

  private waitForFrame(
    waits: readonly WaitForFrame[],
    resume: () => Promise<void> = () => this.processLoop(),
  ): Promise<void> {
    return new Promise((resolve) => {
      this.pendingFrameWait = { resolve, resume, waits };
    });
  }

  private pollFrameWait(nowMs: number): void {
    const pending = this.pendingFrameWait;
    if (this.skipCleanup || !pending) return;
    // _DoExecuteCommands.MoveNext (2791 @ 0x184180280) polls its blockers
    // after DOTween's update and dispatches synchronously when they are clear.
    try {
      if (!pending.waits.every((wait) => wait.isComplete(nowMs))) return;
      if (this.pendingFrameWait !== pending) return;
      this.pendingFrameWait = null;
      this.state = "running";
      pending.resolve(pending.resume());
    } catch (error) {
      try {
        this.failPlayback(error);
      } finally {
        pending.resolve();
      }
    }
  }

  private cancelFrameWait(): void {
    const pending = this.pendingFrameWait;
    if (!pending) return;
    this.pendingFrameWait = null;
    const cleanup = this.skipCleanup;
    try {
      for (const wait of pending.waits) wait.forceEnd?.();
    } finally {
      pending.resolve(cleanup?.completion.then(() => undefined));
    }
  }

  private failPlayback(error: unknown): void {
    this.state = "error";
    this.stopPlaybackInput();
    this.finishLineSeekMissed("error");
    const detail =
      error instanceof Error ? error.message : "unknown runtime error";
    this.onWarning?.({ cursor: this.cursor, detail, type: "error" });
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

  private executeCommand(
    line: ParsedCommandLine,
    isCurrent: () => boolean,
  ): CommandResult | CommandWait[] | Promise<CommandResult | CommandWait[]> {
    // HEADER remains in Story.commands but has no registered executor.
    if (line.command === "header") return "continue";
    const executors = this.commandRegistry.get(line.command);
    if (executors === null) {
      this.warn("unknown_command", line.command);
      return "continue";
    }
    if (executors.length === 1) return executors[0]!(line, isCurrent);
    const combine = (results: CommandResult[]) => {
      const waits = results.filter((result) => result !== "continue");
      return waits.length > 0 ? waits : "continue";
    };
    const results = executors.map((executor) => executor(line, isCurrent));
    return results.every(
      (result): result is CommandResult => !(result instanceof Promise),
    )
      ? combine(results)
      : Promise.all(results).then(combine);
  }

  private executeBuiltinCommand(
    line: ParsedCommandLine,
  ): CommandResult | Promise<CommandResult> {
    const args = line.args;

    // The native command loop runs synchronous executors through the next
    // blocker in the same update. Keep these results synchronous.
    switch (line.command) {
      case "delay":
        // CommonExecutors._ExecuteDelayCommand (2791 @ 0x1841C3EF0)
        // starts WaitForSecondsRealtime even when the scaled time is zero.
        this.state = "waiting_timer";
        return delayWait(this.calculateFadeMs(this.exactArg(args, "time")));

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

      case "blocker": {
        // AVGBlockerPanel._ExecuteBlocker (2791 @ 0x184184890) scales fadetime
        // by animateRatio. A zero fade writes the color and finishes inline.
        // The malformed default `defualt` is intentional.
        const styleArg = toString(this.exactArg(args, "style"), "defualt");
        const style =
          styleArg === "slider" || styleArg === "verticalslider"
            ? styleArg
            : "default";
        const fadeMs = this.calculateFadeMs(
          this.exactArg(args, "fadetime"),
          0.4,
        );
        const completion = this.renderer.setBlocker({
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
        return completion ? completion.then(() => "continue") : "continue";
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
        const finish = createExecutionHandle(true);
        let cancelFrameEnd: (() => void) | undefined;
        this.renderer.playVideo(resolved, () => {
          if (finish.endReason !== undefined || cancelFrameEnd) return;
          // PLAYEND/ERROR calls InvokeEndOfFrame before releasing the
          // executor. The following Update may advance the command loop.
          cancelFrameEnd = this.finishAtFrameEnd(finish);
        });
        return {
          isComplete: () => finish.endReason !== undefined,
          forceEnd: () => {
            finish.end("force_end");
            cancelFrameEnd?.();
            this.renderer.stopVideo();
          },
        };
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

      default:
        if (unsupportedAd8Commands.has(line.command)) {
          this.warn("unsupported_command", line.command);
          return "continue";
        }
        return this.executeRenderCommand(line);
    }
  }

  private async executeRenderCommand(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
    const args = line.args;

    switch (line.command) {
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

      default:
        this.warn("unknown_command", line.command);
        return "continue";
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

  private onTypingComplete(messageLength: number): void {
    const speed = this.getCurrentSpeed();
    this.scheduleAutoClick(
      (speed.autoWaitBaseTime + messageLength * speed.autoWaitTimePerText) *
        1000,
    );
  }

  /**
   * Native RaiseAutoClick (2791 @ 0x18416BEA0) replaces the timer with each
   * valid completion. Views own replacement within a session. This token
   * invalidates every outstanding callback when the story skips or closes.
   */
  private beginTextTyping(messageLength: number): () => void {
    const generation = this.playbackGeneration;
    let completed = false;
    return () => {
      if (completed || this.playbackGeneration !== generation) return;
      completed = true;
      this.onTypingComplete(messageLength);
    };
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
