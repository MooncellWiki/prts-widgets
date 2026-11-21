import mitt, { type Handler } from "mitt";

import { DecisionCommandPredicator } from "./DecisionCommandPredicator";
import { GotoLabelController } from "./GotoLabelController";
import { SkipLabelController } from "./SkipLabelController";
import { normalizeImageKey } from "./asset";
import { resolveCharacterRef, resolveNativeCharacterRef } from "./characterRef";
import {
  exactArg,
  getFiniteFloat,
  isZeroFloat,
  toBoolean,
  toNumber,
  toString,
} from "./commandParams";
import {
  CommandRegistry,
  type ClickCompletion,
  type CommandResult,
  type CommandWait,
  type WaitForClick,
  type WaitForDecision,
  type WaitForDelay,
  type WaitForFrame,
} from "./commandRegistry";
import { AVGEvent, EventPool } from "./eventPool";
import { createExecutionHandle, type ExecutionHandle } from "./execution";
import {
  LOOP_BLOCK_WARNING,
  parseImageLayout,
  parseImageTween,
} from "./imageParams";
import { AudioExecutors } from "./panels/AudioExecutors";
import { BlockerPanel } from "./panels/BlockerPanel";
import { CameraEffectExecutor } from "./panels/CameraEffectExecutor";
import { CgItemPanel } from "./panels/CgItemPanel";
import { CharacterCutinPanel } from "./panels/CharacterCutinPanel";
import { CharacterPanel } from "./panels/CharacterPanel";
import { CharacterslotPanel } from "./panels/CharacterslotPanel";
import { CurtainPanel } from "./panels/CurtainPanel";
import { DecisionPanel } from "./panels/DecisionPanel";
import { DialogPanel } from "./panels/DialogPanel";
import { DisplayableExecutor } from "./panels/DisplayableExecutor";
import { ImagePanel } from "./panels/ImagePanel";
import { LargeBackgroundPanel } from "./panels/LargeBackgroundPanel";
import { ShowItemPanel } from "./panels/ShowItemPanel";
import { SpellStickerPanel } from "./panels/SpellStickerPanel";
import { StickerPanel } from "./panels/StickerPanel";
import { SubtitlePanel } from "./panels/SubtitlePanel";
import { TheaterLabel } from "./panels/TheaterLabel";
import { VideoPanel } from "./panels/VideoPanel";
import { parseScript } from "./parser";
import { expandStoryText } from "./textVariables";

import type { Context } from "../context";
import type { CharacterCommandContext } from "./panels/characterCommandParams";
import type {
  AutoPlayMode,
  AutoPlayState,
  DecisionPolicy,
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
  "gotostage",
  "background",
  "backgroundtween",
  "bgeffect",
  "effect",
] as const;

const unsupportedAd8Commands = new Set(["bgeffect", "effect"]);

type FrameWaitPoll = Omit<WaitForFrame, "isComplete"> & {
  isComplete: (nowMs: number, readRealtimeMs: () => number) => boolean;
};

interface PendingFrameWait {
  waits: readonly FrameWaitPoll[];
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

export class StoryRuntime {
  private readonly audioExecutors: AudioExecutors;
  private readonly defaultSpeed: AutoSpeed;
  private autoPlayMode: AutoPlayMode = "default";
  private pendingAutoClick: PendingAutoClick | null = null;
  private stopFramePolling: (() => void) | null = null;
  private buttonSpeedLevel = 0;
  private readonly commandRegistry = new CommandRegistry<CommandResult>();
  private readonly eventPool = new EventPool<AVGEvent>();
  private readonly context: Context;
  private cursor = 0;
  /** 最近上报的显示文本源行号。尚无文本时为 null。 */
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
      this.applyAutoPlayMode(this.isTheaterMode() ? "button_auto" : "default");
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
  private processing = false;
  private processingCompletion: Promise<void> | null = null;
  private resolveProcessingCompletion: (() => void) | null = null;
  private readonly renderer: StoryRenderer;
  private skipCleanup: ExecutionHandle | null = null;
  private readonly gotoLabelController: GotoLabelController;
  private readonly skipLabelController: SkipLabelController;
  private readonly skipToIndex: number;
  private playbackGeneration = 0;
  private quickSpeedLevel = 0;
  private state: PlayerState = "idle";
  private readonly blockerPanel: BlockerPanel;
  private readonly cameraEffectExecutor: CameraEffectExecutor;
  private readonly characterCutinPanel: CharacterCutinPanel;
  private readonly curtainPanel: CurtainPanel;
  private readonly decisionPanel: DecisionPanel;
  private readonly dialogPanel: DialogPanel;
  private readonly displayableExecutor: DisplayableExecutor;
  private readonly imagePanel: ImagePanel;
  private readonly largeBackgroundPanel: LargeBackgroundPanel;
  private readonly showItemPanel: ShowItemPanel;
  private readonly spellStickerPanel: SpellStickerPanel;
  private readonly stickerPanel: StickerPanel;
  private readonly subtitlePanel: SubtitlePanel;
  private readonly theaterLabel: TheaterLabel;
  private readonly videoPanel: VideoPanel;
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
    this.renderer = renderer;
    // AVGController._PreprocessCommands (2791 @ 0x184171550) records the
    // first SkipToThis anchor before delegating label preprocessing.
    this.skipToIndex = this.lines.findIndex(
      (line) => line.kind === "command" && line.command === "skiptothis",
    );
    const storyVariables = context.storyVariables ?? context.audioVariables;
    this.gotoLabelController = new GotoLabelController(
      this.lines,
      storyVariables,
    );
    this.skipLabelController = new SkipLabelController(
      this.lines,
      options.firstRead ?? true,
      storyVariables,
    );
    this.theaterLabel = new TheaterLabel(
      {
        applyAutoPlay: ({ buttonSpeedLevel, mode, quickSpeedLevel }) => {
          this.buttonSpeedLevel = buttonSpeedLevel;
          this.quickSpeedLevel = quickSpeedLevel;
          this.applyScriptAutoPlayMode(mode);
        },
        cancelAutoClick: () => this.cancelAutoClick(),
        readAutoPlay: () => this.getAutoPlayState(),
      },
      storyVariables,
    );
    this.onWarning = options.onWarning;
    this.audioExecutors = new AudioExecutors(audio, context, (type, detail) =>
      this.warn(type, detail),
    );
    this.blockerPanel = new BlockerPanel(renderer, (seconds) =>
      this.calculateSignedFadeMs(seconds),
    );
    this.curtainPanel = new CurtainPanel(
      renderer,
      (seconds) => this.calculateSignedFadeMs(seconds),
      (detail) => this.warn("invalid_parameter", detail),
    );
    this.characterCutinPanel = new CharacterCutinPanel(renderer, {
      animateRatio: () => this.getCurrentSpeed().animateRatio,
      resolveCharacterName: (ref) =>
        resolveNativeCharacterRef(this.context.linkMap, ref),
      warn: (type, detail) => this.warn(type, detail),
    });
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
    // Web notification listeners can skip or destroy playback synchronously.
    const setDisplayedLine = (lineNumber: number): boolean => {
      const generation = this.playbackGeneration;
      this.displayedLineIndex = lineNumber;
      return !this.destroyed && generation === this.playbackGeneration;
    };
    this.dialogPanel = new DialogPanel(renderer, {
      beginTyping: (length) => this.beginTextTyping(length),
      prepareEndtip: () => this.prepareEndtip(),
      setDisplayedLine,
      translateText: (text) => this.translateText(text),
      typeWriterDelayMs: () => this.getCurrentSpeed().typeWriterDelayMs,
    });
    this.displayableExecutor = new DisplayableExecutor(renderer, {
      calculateFadeMs: (seconds, fallback) =>
        this.calculateFadeMs(seconds, fallback),
      translateText: (text) => this.translateText(text),
      warnInvalidParameter: (detail) => this.warn("invalid_parameter", detail),
    });
    this.imagePanel = new ImagePanel(
      renderer,
      (seconds) => this.calculateFadeMs(seconds),
      (type, detail, line) =>
        this.warn(type, detail, line?.lineNumber, line?.command),
    );
    this.largeBackgroundPanel = new LargeBackgroundPanel(
      renderer,
      (type, detail, line) =>
        this.warn(type, detail, line?.lineNumber, line?.command),
    );
    this.showItemPanel = new ShowItemPanel(renderer, {
      resolveImageKey: normalizeImageKey,
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
      setDisplayedLine,
      typeWriterDelayMs: () => this.getCurrentSpeed().typeWriterDelayMs,
      translateText: (text) => this.translateText(text),
      warn: (detail) => this.warn("parse", detail),
    });
    this.subtitlePanel = new SubtitlePanel(renderer, {
      beginTyping: (length) => this.beginTextTyping(length),
      setDisplayedLine,
      translateText: (text) => this.translateText(text),
      typeWriterDelayMs: () => this.getCurrentSpeed().typeWriterDelayMs,
    });
    this.cameraEffectExecutor = new CameraEffectExecutor(renderer, {
      animateRatio: () => this.getCurrentSpeed().animateRatio,
      calculateFadeMs: (seconds, fallback) =>
        this.calculateFadeMs(seconds, fallback),
      warnUnsupportedVisual: (detail) =>
        this.warn("unsupported_visual", detail),
    });
    new CgItemPanel(renderer, {
      animateRatio: () => this.getCurrentSpeed().animateRatio,
      resolveImageKey: normalizeImageKey,
      warn: (type, detail) => this.warn(type, detail),
    }).register(this.commandRegistry);
    this.audioExecutors.register(this.commandRegistry);
    this.blockerPanel.register(this.commandRegistry);
    this.cameraEffectExecutor.register(this.commandRegistry);
    this.characterCutinPanel.register(this.commandRegistry);
    const characterPlayback: CharacterCommandContext = {
      // CharacterPanel and AVGCharacterslotPanel.CalculateFadetime
      // (2791 @ 0x1841BF7F0 / 0x1841A0A20) retain the duration's sign.
      calculateFadeMs: (seconds, fallback) =>
        this.scaleFadeMs(seconds, fallback),
      resolveCharacterName: (ref) => resolveCharacterRef(context.linkMap, ref),
      warn: (type, detail, line) =>
        this.warn(type, detail, line?.lineNumber, line?.command),
    };
    new CharacterPanel(renderer, characterPlayback).register(
      this.commandRegistry,
    );
    new CharacterslotPanel(renderer, characterPlayback).register(
      this.commandRegistry,
    );
    this.curtainPanel.register(this.commandRegistry);
    this.decisionPanel.register(this.commandRegistry);
    this.dialogPanel.register(this.commandRegistry);
    this.displayableExecutor.register(this.commandRegistry);
    this.gotoLabelController.register(this.commandRegistry);
    this.imagePanel.register(this.commandRegistry);
    this.largeBackgroundPanel.register(this.commandRegistry);
    this.showItemPanel.register(this.commandRegistry);
    this.skipLabelController.register(this.commandRegistry);
    this.spellStickerPanel.register(this.commandRegistry);
    this.stickerPanel.register(this.commandRegistry);
    this.subtitlePanel.register(this.commandRegistry);
    this.theaterLabel.register(this.commandRegistry);
    this.videoPanel = new VideoPanel(renderer, {
      beginWait: () => {
        this.state = "waiting_video";
      },
      finishAtFrameEnd: (handle, finishCommand, afterForceEnd) =>
        this.finishAtFrameEnd(handle, finishCommand, afterForceEnd),
      isSkipping: () => this.skipCleanup !== null && !this.destroyed,
      missingVideoUrls: context.missingVideoUrls,
      warn: (type, detail) => this.warn(type, detail),
    });
    this.videoPanel.register(this.commandRegistry);
    // CommonExecutors._ExecuteDelayCommand (2791 @ 0x1841C3EF0) scales
    // time once and starts a WaitForSecondsRealtime, including at zero.
    this.commandRegistry.register("delay", ({ args }) => ({
      delayMs: this.calculateFadeMs(
        getFiniteFloat(args, "time", this.context.audioVariables),
      ),
    }));
    for (const command of builtinCommandNames)
      this.commandRegistry.register(command, (line) =>
        this.executeBuiltinCommand(line),
      );
  }

  readonly onWarning?: (warning: RuntimeWarning) => void;

  getState(): PlayerState {
    return this.state;
  }

  /** 当前显示行供 Log All 和调试页跟随。 */
  getDisplayedLineIndex(): number | null {
    return this.displayedLineIndex;
  }

  /**
   * 把 UI 监听器包成不会反噬引擎的 handler。mitt 的 emit 不吞异常，而显示行赋值都
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
    return this.theaterLabel.isActive;
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
    const mode = this.isTheaterMode() ? "button_auto" : requested;

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
    // Web exposes skip for scripts with skipnode or a forward SkipToThis.
    const hasSkipAnchor =
      this.skipToIndex >= 0
        ? this.cursor <= this.skipToIndex
        : this.skipLabelController.hasSkipNodes;
    // AVGController.get_isSkippable (2791 @ 0x184174040) checks the story
    // header and the current segment before exposing the skip button.
    const storySkippable = this.context.storyMetadata?.isSkippable ?? true;
    return (
      running &&
      hasSkipAnchor &&
      storySkippable &&
      this.skipLabelController.canSkipCurrentSegment
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
      ({ nowMs, readRealtimeMs }) =>
        this.pollAfterUpdate(nowMs, readRealtimeMs),
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

    // AVGController.OnClickPress (2791 @ 0x184169CB0) ignores theater
    // presses. Otherwise it switches to manual, even during a frame wait.
    if (this.isTheaterMode()) return;

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
    afterForceEnd?: () => void,
  ): () => void {
    return this.renderer.onFrameEnd(() => {
      if (this.destroyed) return;
      try {
        if (handle.endReason === "force_end") {
          afterForceEnd?.();
          return;
        }
        if (handle.endReason !== undefined || this.skipCleanup) return;
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

    // AVGController.OnSkipBtnClicked (2791 @ 0x18416B250) ignores quick play.
    if (this.autoPlayMode === "quick_play") return;

    const activeProcessCompletion = this.processingCompletion;
    const skipToThis = this.skipToIndex >= 0;
    let shouldResume = false;

    // m_executeIndex points at the command currently being waited on while our
    // cursor already points at the next command, hence cursor <= anchorIndex is
    // the native m_executeIndex < m_skipToIndex forward-only test.
    if (skipToThis) {
      this.cursor = this.skipToIndex + 1;
      shouldResume = true;
    } else {
      const nextIndex = this.skipLabelController.consumeNextNode();
      if (
        nextIndex !== undefined &&
        !this.skipLabelController.canSkipCurrentSegment
      ) {
        // A protected anchor resumes at the following command.
        this.cursor = nextIndex + 1;
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
        // Neither native character panel resets the built-in slots on skip.
        // A Web-only load must release the old executor before playback resumes.
        this.renderer.cancelCharacterPreparation(shouldResume);
      } finally {
        this.playbackGeneration += 1;
        if (skipToThis) {
          // SkipStory resets the mode and story cache after ForceEnd.
          this.theaterLabel.clearOnSkipToThis();
          this.setAutoPlayMode("default");
          this.skipLabelController.reset();
        }
        if (skipToThis || !shouldResume) this.cancelAutoClick();
      }
      if (shouldResume) {
        for (const reset of [
          () => this.characterCutinPanel.reset(),
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
   * LargeBackgroundPanel family applies literal timing in its own executors.
   */
  private calculateFadeMs(seconds: unknown, fallback = 0): number {
    return Math.max(0, this.scaleFadeMs(seconds, fallback));
  }

  private scaleFadeMs(seconds: unknown, fallback: number): number {
    return (
      toNumber(seconds, fallback) * this.getCurrentSpeed().animateRatio * 1000
    );
  }

  /** AVGBlockerPanel / AVGCurtainPanel branch on the scaled float IsZero. */
  private calculateSignedFadeMs(seconds: number): number {
    const ratio = this.getCurrentSpeed().animateRatio;
    const scaledFloat = Math.fround(seconds) * Math.fround(ratio);
    return isZeroFloat(scaledFloat) ? 0 : seconds * ratio * 1000;
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

  private pollAfterUpdate(nowMs: number, readRealtimeMs: () => number): void {
    this.pollFrameWait(nowMs, readRealtimeMs);
    const resume = this.resumeCommands;
    this.resumeCommands = null;
    resume?.();
    if (this.skipCleanup) return;

    const pending = this.pendingAutoClick;
    if (!pending) return;
    // _DoAutoClick (2791 @ 0x184180000): WaitUntil, WaitForSecondsRealtime,
    // then a separate WaitUntil. keepWaiting (0x186DE4C30) reads real time
    // once to initialize the deadline and again to check it.
    switch (pending.phase) {
      case "awaiting_mode":
        if (this.autoPlayMode !== "default") pending.phase = "timing";
        return;
      case "timing":
        pending.deadlineMs ??= readRealtimeMs() + pending.delayMs;
        if (readRealtimeMs() >= pending.deadlineMs) pending.phase = "elapsed";
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
    this.videoPanel.reset();
    this.playbackGeneration += 1;
    // 销毁后不该再有推送落到 UI 上
    this.events.all.clear();
  }

  private stopPlaybackInput(): void {
    this.stopFramePolling?.();
    this.stopFramePolling = null;
    this.cancelInputWait();
    this.cancelFrameWait();
    this.renderer.cancelCharacterPreparation();
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
    // OnStoryCommitted (2791 @ 0x18416B750) deactivates the AVG root while
    // a video fade or delayed media stop can still be pending.
    this.videoPanel.reset();
    // AVGController.OnStoryEnd (2791 @ 0x18416B9C0) calls SubtitlePanel.OnReset.
    void this.subtitlePanel.reset();
    this.blockerPanel.reset();
    this.displayableExecutor.reset();
    this.curtainPanel.reset();
    // AVGCgItemPanel.OnReset (2791 @ 0x1841890F0) disposes the slots at
    // story end. ShouldResetOnSkip keeps them alive across segment skips.
    this.renderer.resetCgItems();
    this.largeBackgroundPanel.reset();
    this.imagePanel.reset();
    this.renderer.resetCharacters();
    this.cameraEffectExecutor.reset();
    this.characterCutinPanel.reset();
    // Native end-of-story reset destroys a lingering show-item slot
    // (AVGShowItemPanel._Reset) instead of leaving the item on screen.
    this.showItemPanel.reset();
    this.audioExecutors.reset();
    // OnStoryCommitted (2791 @ 0x18416B750) hides the AVG root before OnReset.
    // Recycle the ordinary sticker views immediately on the Web canvas.
    const stickerReset = this.stickerPanel.reset(0);
    this.state = "finished";
    this.finishLineSeekMissed("finished");
    return stickerReset;
  }

  private async processLoop(
    remainingWaits?: readonly (WaitForClick | WaitForDecision)[],
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

        // _DoExecuteCommands.MoveNext (2791 @ 0x184180280) checks bounds,
        // consumes a pending warp, then fetches the command for the predicate.
        if (this.cursor >= this.lines.length) {
          // _DoExecuteCommands.MoveNext (2791 @ 0x184180CA6) yields
          // WaitForSecondsRealtime(0.2) before DoEndStory.
          return this.waitForFrame([{ delayMs: 200 }], () =>
            this.finishPlayback(),
          ).catch((error: unknown) => this.failPlayback(error));
        }

        const gotoIndex = this.gotoLabelController.consumeGotoIndex();
        if (gotoIndex !== undefined) {
          this.cursor = gotoIndex;
          // parseScript appends an endtip after the last label. Treat a
          // target past the command list as story completion defensively.
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
        // A skipped executor can still return a wait from the previous segment.
        if (!isCurrent()) continue;
        if (result === "continue") continue;

        const waits = Array.isArray(result) ? result : [result];
        const frameWaits = waits.filter(
          (wait) => "isComplete" in wait || "delayMs" in wait,
        );
        const followUp = waits.filter(
          (wait) => "handleClick" in wait || "showDecision" in wait,
        );
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
    waits: readonly (WaitForFrame | WaitForDelay)[],
    resume: () => Promise<void> = () => this.processLoop(),
  ): Promise<void> {
    const frameWaits = waits.map((wait): FrameWaitPoll => {
      if ("isComplete" in wait) return wait;
      this.state = "waiting_timer";
      let deadlineMs: number | undefined;
      return {
        // WaitForSecondsRealtime.keepWaiting (2791 @ 0x186DE4C30) reads
        // Time.realtimeSinceStartup separately to set and check the deadline.
        isComplete: (_nowMs, readRealtimeMs) => {
          deadlineMs ??= readRealtimeMs() + wait.delayMs;
          return readRealtimeMs() >= deadlineMs;
        },
      };
    });
    return new Promise((resolve) => {
      const pending = { resolve, resume, waits: frameWaits };
      this.pendingFrameWait = pending;
      // _LoadImage is synchronous in 2791. Hand a ready Web preparation to
      // the next command before another tween update can run its callbacks.
      if (frameWaits.every((wait) => wait.assetsReady)) {
        void Promise.all(frameWaits.map((wait) => wait.assetsReady)).then(
          () => {
            if (this.pendingFrameWait === pending)
              this.pollFrameWait(performance.now());
          },
        );
      }
    });
  }

  private pollFrameWait(
    nowMs: number,
    readRealtimeMs = () => performance.now(),
  ): void {
    const pending = this.pendingFrameWait;
    if (this.skipCleanup || !pending) return;
    // _DoExecuteCommands.MoveNext (2791 @ 0x184180280) polls its blockers
    // after DOTween's update and dispatches synchronously when they are clear.
    try {
      if (
        !pending.waits.every((wait) => wait.isComplete(nowMs, readRealtimeMs))
      )
        return;
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

  private executeCommand(
    line: ParsedCommandLine,
    isCurrent: () => boolean,
  ): CommandResult | CommandWait[] | Promise<CommandResult | CommandWait[]> {
    // HEADER and SkipToThis remain in Story.commands without executors.
    if (line.command === "header" || line.command === "skiptothis")
      return "continue";
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
    // The native command loop runs synchronous executors through the next
    // blocker in the same update. Keep these results synchronous.
    switch (line.command) {
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

        const resolved = normalizeImageKey(image);
        if (!resolved) {
          this.warn("missing_asset", `background: ${image}`);
          await this.renderer.clearBackground(fadeMs, block);
          return "continue";
        }

        await this.renderer.setBackground(resolved, {
          ...parseImageLayout(args),
          block,
          fadeMs,
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
        const tween = parseImageTween(args);
        if (block && tween.loop) {
          // Native logs this (sic) DLog.LogError and still starts the loop,
          // whose OnComplete(FinishCommand) then never fires, so the story
          // hangs. The warning keeps the native typo "intinity lop" on
          // purpose, but block is dropped below so playback continues: an
          // awaited renderer call that never settles cannot be interrupted
          // here (skipNode would wait on it forever).
          this.warn(
            "invalid_parameter",
            LOOP_BLOCK_WARNING,
            line.lineNumber,
            line.command,
          );
        }

        await this.renderer.setBackgroundTween({
          ...tween,
          block: block && !tween.loop,
          durationMs: Math.max(0, toNumber(duration, 0) * 1000),
        });
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
}
