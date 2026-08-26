import mitt, { type Handler } from "mitt";

import { resolveStoryAudioByKey, resolveStoryVideoByKey } from "./asset";
import {
  nativeCharacterFadeIdentity,
  resolveCharacterSelection,
} from "./characterRef";
import { CommandRegistry } from "./commandRegistry";
import {
  parseDecision,
  parsePredicateReferences,
  passesGate,
} from "./log/semantics";
import { parseScript } from "./parser";
import {
  buildTagStyles,
  collectColors,
  parseRichChars,
  richCharsToTaggedText,
  type RichChar,
} from "./richtext";
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
  ParsedCommandLine,
  PlayerState,
  RuntimeChoiceSelection,
  RuntimeLogPosition,
  RuntimeOptions,
  RuntimeWarning,
  SpellStickerInput,
  StickerInput,
  StoryAudio,
  StoryCommandArgs,
  StoryPlayerEvents,
  StoryRenderer,
  SubtitleInput,
  TimerClearInput,
  TimerStickerInput,
} from "./types";

type CommandResult = "continue" | "wait_input";

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
const TYPE_WRITER_ORIGIN_DELAY_MS = 40;

const builtinCommandNames = [
  "endtip",
  "dialog",
  "delay",
  "video",
  "skipnode",
  "skiptothis",
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
  "multiline",
  "subtitle",
  "sticker",
  "timersticker",
  "timerclear",
  "stickerclear",
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

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))
    return Number(value);
  return fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))
    return Number(value);
  return undefined;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function toString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return fallback;
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

function parseVector2(value: unknown): { x: number; y: number } | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parts = value.split(",");
  if (parts.length < 2) return undefined;
  const x = Number(parts[0]!.trim());
  const y = Number(parts[1]!.trim());
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

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

    // Native port: Torappu.AVG.AVGStoryCache.CalSkipMode. Only the exact
    // lower-case sentinel maps to FIRST_CANNOT_SKIP; every other value,
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
  }
  private decisionSelectValue = 0;
  private decisionReferences: number[] | null = null;
  /** 调试侧注入的自动决策钩子；null = 全部走 DecisionPanel 人工选择 */
  private decisionPolicy: DecisionPolicy | null = null;
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
   * Native port: Torappu.AVG.AVGShowItemPanel's single `_slotInUse`.
   * It determines whether `_ExecuteHideItem` blocks.
   */
  private itemSlotInUse = false;
  private theaterMode = false;
  private theaterAutoPlayCache: AutoPlayState | null = null;
  private typingSession: {
    id: number;
    speaker: string;
    richChars: RichChar[];
    tagStyles?: Record<string, { fill: string }>;
  } | null = null;
  private typingSessionId = 0;
  private quickSpeedLevel = 0;
  private currentMessageLength = 0;
  private currentTypingComplete = false;
  private state: PlayerState = "idle";
  private multilineText = "";
  private multilineEnd = false;
  /** Rich-char count already on screen from earlier multiline fragments. */
  private multilineShownChars = 0;
  private readonly stickerIds = new Set<string>();
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
    this.onWarning = options.onWarning;
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

  /** Web 调试适配：注入后 decision 不等面板点击，直接按返回的下标选择 */
  setDecisionPolicy(policy: DecisionPolicy | null): void {
    this.decisionPolicy = policy;
  }

  setAutoPlayMode(mode: AutoPlayMode): void {
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
      this.scheduleAutoClick(this.currentMessageLength);
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
      this.scheduleAutoClick(this.currentMessageLength);
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
    // This widget exposes a segment-skip button rather than native's whole
    // story StopStory action. Keep it disabled when the script has no remaining
    // SkipToThis/skipnode destination at all.
    return running && hasSkipAnchor && skipToPending;
  }

  async start(): Promise<void> {
    if (this.destroyed) return;
    if (this.state !== "idle") return;

    // The normal AVG command loop is not entered for VIDEO_ONLY stories. Their
    // media is owned by the separate entry-video flow in the game host.
    if (this.context.storyMetadata?.isVideoOnly) {
      this.state = "finished";
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

    if (this.state !== "waiting_input") return;

    if (this.theaterMode) return;

    this.setAutoPlayMode("default");
    await this.advanceFromClick();
  }

  private async advanceFromClick(): Promise<void> {
    if (this.state !== "waiting_input") return;

    if (this.finishTypingNow()) {
      this.onTypingComplete();
      return;
    }
    if (this.renderer.finishTextTyping()) {
      this.onTypingComplete();
      return;
    }

    this.cancelAutoClick();
    if (this.multilineEnd) this.resetMultiline();
    const inputEffect = this.pendingInputEffect;
    this.pendingInputEffect = null;
    await inputEffect?.();
    this.state = "running";
    await this.processLoop();
  }

  async skipNode(): Promise<void> {
    if (this.destroyed || !this.canSkipNode()) return;

    const hadActiveProcessLoop = this.processing;
    const activeProcessCompletion = this.processingCompletion;
    let shouldResume = false;

    // m_executeIndex points at the command currently being waited on while our
    // cursor already points at the next command, hence cursor <= anchorIndex is
    // the native m_executeIndex < m_skipToIndex forward-only test.
    if (this.skipToIndex >= 0 && this.cursor <= this.skipToIndex) {
      this.cursor = this.skipToIndex + 1;
      shouldResume = true;
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

      const tutorial = this.context.storyMetadata?.isTutorial ?? false;
      const isSkippable =
        !tutorial &&
        (this.currentSkipMode !== "nofirstskip" || !this.firstRead);
      if (nextLabel && !isSkippable) {
        // Native stores the anchor index and the coroutine's leading increment
        // resumes at the following command.
        this.cursor = nextLabel.lineIndex + 1;
        shouldResume = true;
      } else {
        this.cursor = this.lines.length;
      }
    }

    this.pendingInputEffect = null;
    // Native port: both executors on AVGCharacterCutinPanel reset on skip --
    // ShouldResetOnSkip() @ 0x183e492b0 returns true and _Reset @ 0x183e4af80
    // empties the slot pool / _slots before resetting the interlude
    // controller, so a skipped node must not leave cutin slots behind.
    await this.renderer.clearInterludes();
    await this.renderer.clearCharacterCutin();
    await this.renderer.clearSpellStickers();

    this.cancelTyping();
    if (shouldResume) {
      this.state = "running";
    } else if (!hadActiveProcessLoop) {
      this.state = "finished";
    }

    // Establish the destination state before releasing a blocking executor.
    // Its existing processLoop owns continuation; starting another loop would
    // race it and can leave state="running" with no loop alive.
    this.interruptPendingWait();
    if (hadActiveProcessLoop) await activeProcessCompletion;
    else if (shouldResume) await this.processLoop();
  }

  private getCurrentSpeed(): AutoSpeed {
    if (this.autoPlayMode === "button_auto")
      return (
        BUTTON_AUTO_SPEEDS[this.buttonSpeedLevel] ?? BUTTON_AUTO_SPEEDS[0]!
      );
    if (this.autoPlayMode === "quick_play")
      return QUICK_AUTO_SPEEDS[this.quickSpeedLevel] ?? QUICK_AUTO_SPEEDS[0]!;
    return this.defaultSpeed;
  }

  /**
   * Native port: Torappu.AVG.AVGUtils.CalculateFadetime, adapted from seconds
   * to milliseconds. It applies animateRatio * fadetime.
   *
   * Only panels implementing IFadeTimeRatio route through it. AVGImagePanel does
   * (background / image / imagerotate); its tween executors bypass it, and the
   * whole LargeBackgroundPanel family (largebg / verticalbg / gridbg /
   */
  private calculateFadeMs(seconds: unknown, fallback = 0): number {
    return Math.max(
      0,
      toNumber(seconds, fallback) * this.getCurrentSpeed().animateRatio * 1000,
    );
  }

  /**
   * `delay` on sticker is a scale factor against the asset's `originDelay`, not
   * an absolute per-character time: typeWriterDelay = global * delay /
   * originDelay. `delay=0` therefore means "print the whole line at once",
   * which is what the samples writing delay=0 rely on. multiline applies the
   * same ratio but takes a different fallback -- see multilineTypeDelayScale.
   */
  private stickerTypeDelayMs(value: unknown): number {
    const originDelaySeconds = TYPE_WRITER_ORIGIN_DELAY_MS / 1000;
    const scale =
      value === undefined
        ? 1
        : toNumber(value, originDelaySeconds) / originDelaySeconds;
    return Math.max(0, this.getCurrentSpeed().typeWriterDelayMs * scale);
  }

  /**
   * Native port: `DialogPanel._ExecuteMultiline` resolves the ratio's numerator
   * with `GetOrDefault<float>("delay", AVGController.typeWriterDelay)` -- the
   * *current* global delay, not the asset's `originDelay`. The scale is
   * therefore itself speed-dependent, and an omitted `delay` makes multiline
   * type faster than a plain dialogue line at every non-default speed level
   * (0.25x at button-auto level 1). Only the default speed cancels out to 1.
   */
  private multilineTypeDelayScale(value: unknown): number {
    const originDelaySeconds = TYPE_WRITER_ORIGIN_DELAY_MS / 1000;
    const currentDelaySeconds = this.getCurrentSpeed().typeWriterDelayMs / 1000;
    const delaySeconds =
      value === undefined
        ? currentDelaySeconds
        : toNumber(value, currentDelaySeconds);
    return delaySeconds / originDelaySeconds;
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
    this.cancelTyping();
    this.cancelAutoClick();
    this.interruptPendingWait();
    this.pendingInputEffect = null;
    // 销毁后不该再有推送落到 UI 上
    this.events.all.clear();
  }

  private async processLoop(): Promise<void> {
    if (this.processing) return;

    this.processing = true;
    this.processingCompletion = new Promise<void>((resolve) => {
      this.resolveProcessingCompletion = resolve;
    });

    try {
      while (!this.destroyed) {
        if (this.cursor >= this.lines.length) {
          this.renderer.clearAnimTexts();
          this.renderer.clearAvgDisplays();
          this.state = "finished";
          return;
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

        if (line.kind === "dialogue") {
          this.resetMultiline();
          if (!line.text) {
            this.cancelTyping();
            this.renderer.setDialogue("", "");
            continue;
          }
          this.displayedLineIndex = line.lineNumber;
          this.waitForDialogueInput(line.speaker, line.text);
          return;
        }

        if (line.kind === "narration") {
          if (!line.text) continue;
          this.resetMultiline();
          this.displayedLineIndex = line.lineNumber;
          this.waitForDialogueInput("", line.text);
          return;
        }

        const result = await this.executeCommand(line);
        if (result === "wait_input") {
          this.state = "waiting_input";
          return;
        }
      }
    } catch (error) {
      this.state = "error";
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
    return Object.prototype.hasOwnProperty.call(args, key)
      ? args[key]
      : undefined;
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

  private resolveCharacterName(
    ref: string,
  ): { base: string; expression: string } | null {
    return resolveCharacterSelection(this.context.linkMap, ref);
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
      case "endtip": {
        // Native port: Torappu.AVG.DialogPanel._ExecuteEndtip and
        // AVGStoryCache.shouldProcessEndtip. It only shows and blocks in auto
        // play for non-video-only stories; manual mode is a no-op.
        const shouldProcessEndtip =
          (this.autoPlayMode === "button_auto" ||
            this.autoPlayMode === "quick_play") &&
          !(this.context.storyMetadata?.isVideoOnly ?? false);
        if (!shouldProcessEndtip) return "continue";

        this.setAutoPlayMode("default");
        this.resetMultiline();
        this.startTypingDialogue("", line.content);
        return "wait_input";
      }

      case "dialog": {
        // Native port: Torappu.AVG.DialogPanel._ExecuteDialog. `[Dialog]`,
        // `[name="X"]` and bare narration all reach it under the sentinel `dialog`;
        // the multi-param forms
        // (`[name="X",avatarId=1]`, `[Delay=2]`, `[imagegroup=...]`) land here
        // too. Only the content-bearing branch resets multiline and blocks; an
        // empty content just hides the box and returns false.
        if (line.content) {
          this.resetMultiline();
          this.displayedLineIndex = line.lineNumber;
          this.waitForDialogueInput(
            toString(this.exactArg(args, "name")),
            line.content,
          );
          return "wait_input";
        }
        this.cancelTyping();
        this.renderer.setDialogue("", "");
        return "continue";
      }

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
        // Native port: Torappu.AVG.VideoPanel._ExecuteVideo / _PlayVideo. `url`
        // takes priority and is used verbatim; only the `res` fallback is resolved
        const url = toString(this.exactArg(args, "url"));
        const res = toString(this.exactArg(args, "res"));
        if (!url && !res) {
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

        this.state = "waiting_video";
        const interrupted = await this.waitInterruptiblePromise(
          this.renderer.playVideo(resolved),
          () => this.renderer.stopVideo(),
        );
        // PLAYEND/ERROR finish on the next frame. Force-end is released by the
        // wrapper immediately and deliberately bypasses this yield.
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

      case "background": {
        // Native port: Torappu.AVG.AVGImagePanel._ExecuteImage as registered by
        // BackgroundPanel. This covers its clear/load-failure and scaled-fade
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

        await this.renderer.setBackground(resolved, {
          block,
          fadeMs,
          scaleX: toNumber(this.exactArg(args, "xScale"), 1),
          scaleY: toNumber(this.exactArg(args, "yScale"), 1),
          screenAdapt: this.parseScreenAdapt(
            this.exactArg(args, "screenadapt"),
          ),
          tiled: toBoolean(this.exactArg(args, "tiled"), false),
          x: toNumber(this.exactArg(args, "x"), 0),
          y: toNumber(this.exactArg(args, "y"), 0),
        });
        return "continue";
      }

      case "backgroundtween": {
        // Native port: Torappu.AVG.AVGImagePanel._ExecuteImageTween. Duration is
        const duration = this.exactArg(args, "duration");

        await this.renderer.setBackgroundTween({
          // duration defaults to 0.0; <= 0 completes both tweens instantly.
          block:
            toNumber(duration, 0) > 0 &&
            toBoolean(this.exactArg(args, "block"), false),
          durationMs: Math.max(0, toNumber(duration, 0) * 1000),
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
          return "continue";
        }

        await this.renderer.setGridBackground({
          assetKind: groupSelection.assetKind,
          block,
          fadeMs,
          imageKeys,
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
        // It accepts one width and up to four vertically stacked tiles; fadetime
        const imageGroup = toString(this.exactArg(args, "imagegroup"));
        const cgGroup = toString(this.exactArg(args, "cggroup"));
        const groupSelection = resolveGroupedAssetSelection(
          imageGroup,
          cgGroup,
        );
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
          this.warn("parse", "verticalbg imagegroup is empty");
          return "continue";
        }

        if (
          imageKeys.length > 4 ||
          solidWidths.length !== 1 ||
          solidHeights.length !== imageKeys.length
        ) {
          this.warn(
            "parse",
            `verticalbg expects width_count * height_count === image_count, got ${solidWidths.length} * ${solidHeights.length} !== ${imageKeys.length}`,
          );
          return "continue";
        }

        await this.renderer.setGridBackground({
          assetKind: groupSelection.assetKind,
          block,
          fadeMs,
          imageKeys,
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
        // Native port: Torappu.AVG.LargeBackgroundPanel._ExecuteImage (the
        // LargeBackgroundPanel method, not AVGImagePanel's namesake). It composes
        // two horizontal tiles and keeps fadetime literal.
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
        const initPositionMode =
          initPositionModeArg === "center" ||
          initPositionModeArg === "lowercenter" ||
          initPositionModeArg === "upperleft"
            ? initPositionModeArg
            : "default";
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
        const solidHeight = toNumber(this.exactArg(args, "solidheight"), 0);
        const solidHeights = solidHeight > 0 ? [solidHeight] : [];

        if (imageKeys.length === 0) {
          this.warn("parse", "largebg imagegroup is empty");
          return "continue";
        }

        if (
          imageKeys.length !== 2 ||
          solidWidths.length !== 2 ||
          solidHeights.length !== 1
        ) {
          this.warn(
            "parse",
            `largebg expects width_count * height_count === image_count, got ${solidWidths.length} * ${solidHeights.length} !== ${imageKeys.length}`,
          );
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
          scaleX: toNumber(this.exactArg(args, "xScale"), 1),
          scaleY: toNumber(this.exactArg(args, "yScale"), 1),
          screenAdapt: this.parseScreenAdapt(
            this.exactArg(args, "screenadapt"),
          ),
          tiled: toBoolean(this.exactArg(args, "tiled"), false),
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
        const style = toString(this.exactArg(args, "style"), "photo");
        if (style !== "photo" && style !== "cutin") {
          this.warn(
            "invalid_parameter",
            `showitem style is not registered: ${style}`,
            line.lineNumber,
            line.command,
          );
          return "continue";
        }
        if (style === "cutin")
          this.warn(
            "unsupported_visual",
            "showitem style=cutin uses the cutin slot expand animation",
            line.lineNumber,
            line.command,
          );

        const image = toString(this.exactArg(args, "image"));
        if (!image) return "continue";

        const resolved = this.resolveImageKey(image);
        if (!resolved) {
          this.warn("missing_asset", `showitem: ${image}`);
          return "continue";
        }

        // Native port scope: AVGShowItemPanel._ExecuteShowItem / _ExecuteHideItem.
        // Neither executor reads `block`: showitem always returns true, and
        // hideitem returns true only while a slot is actually in use. The photo
        // slot's serialized defaults are _defaultFadeTime 0.5 and
        // _defaultBlackAlpha 0.4; offsetx/offsety default to a hardcoded 0.
        await this.renderer.showItem({
          blackAlpha: clamp(toNumber(this.exactArg(args, "black"), 0.4), 0, 1),
          block: true,
          fadeMs: Math.max(
            0,
            Math.round(toNumber(this.exactArg(args, "fadetime"), 0.5) * 1000),
          ),
          key: resolved,
          offsetX: toNumber(this.exactArg(args, "offsetx"), 0),
          offsetY: toNumber(this.exactArg(args, "offsety"), 0),
        });
        this.itemSlotInUse = true;
        return "continue";
      }

      case "hideitem": {
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
          // Native port scope: AVGCgItemPanel._ShowItem's `blocker` branch uses a
          // scene-resident sprite and deliberately skips m_slotsInUseDict. No
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
          // `AVGShowItemCgSlot.Show` defaults `ease` to `Ease.Linear` (= 1),
          // not to an eased curve.
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
        await this.renderer.clearCgItems(
          key,
          Math.max(
            0,
            Math.round(toNumber(this.exactArg(args, "fadetime"), 0.13) * 1000),
          ),
          // `AVGShowItemCgSlot.Hide` uses the same `Ease.Linear` fallback.
          toString(this.exactArg(args, "ease"), "Linear"),
          toBoolean(this.exactArg(args, "block"), false),
        );
        return "continue";
      }

      case "imagetween": {
        // Native port: Torappu.AVG.AVGImagePanel._ExecuteImageTween. Its duration
        const durationMs = Math.max(
          0,
          toNumber(this.exactArg(args, "duration"), 0) * 1000,
        );
        await this.renderer.setImageTween({
          block:
            durationMs > 0 && toBoolean(this.exactArg(args, "block"), false),
          durationMs,
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
        // Native port: Torappu.AVG.AVGImagePanel._ExecuteImageRotate. Unlike the
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
        const durationMs = Math.max(
          0,
          toNumber(this.exactArg(args, "duration"), 0) * 1000,
        );

        await this.renderer.setLargeBackgroundTween({
          block:
            durationMs > 0 && toBoolean(this.exactArg(args, "block"), false),
          durationMs,
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
        const xScale = toOptionalNumber(this.arg(args, "xscale"));
        const yScale = toOptionalNumber(this.arg(args, "yscale"));
        const x = toOptionalNumber(this.arg(args, "x"));
        const y = toOptionalNumber(this.arg(args, "y"));

        await this.renderer.setLargeImageTween({
          block: toBoolean(this.arg(args, "block"), false),
          durationMs: Math.max(
            0,
            toNumber(this.arg(args, "duration"), 0.15) * 1000,
          ),
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
        // default `defualt` is intentional, and fadetime is scaled.
        const styleArg = toString(this.exactArg(args, "style"), "defualt");
        const style =
          styleArg === "slider" || styleArg === "verticalslider"
            ? styleArg
            : "default";
        const fadeMs = Math.max(
          0,
          toNumber(this.exactArg(args, "fadetime"), 0.4) * 1000,
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
        const fadeMs = Math.max(
          0,
          Math.round(toNumber(this.exactArg(args, "fadetime"), 0.4) * 1000),
        );
        // Native port: Torappu.AVG.AVGCurtainPanel._ExecuteCurtain. It zeroes its
        // closure's block field on both the
        // zero-fadetime and the direction < 0 paths, so only a real curtain tween
        // can block -- the same short circuit blocker has.
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
        // Native port: Torappu.AVG.AVGCharacterslotPanel._ExecuteCharslot. Duration
        // defaults to 0.0 and goes through CalculateFadetime; zero skips animation.
        const durationMs = Math.round(this.calculateFadeMs(args.duration, 0));
        const block = toBoolean(args.isblock, false);

        // The clear branch keys off an empty `slot`, never an empty `name`, and it
        // only touches the three built-in slots (custom slots are left alone).
        if (!rawSlot) {
          const clearPromise = this.renderer.clearCharacters(
            undefined,
            durationMs,
          );
          if (block) await clearPromise;
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

        const resolved = nameRef ? this.resolveCharacterName(nameRef) : null;
        if (nameRef && !resolved) {
          this.warn("missing_asset", `character: ${nameRef}`);
          return "continue";
        }

        await this.renderer.setCharacter({
          action: this.parseCharacterSlotAction(args.action),
          ...(args.angle === undefined
            ? {}
            : { angle: toNumber(args.angle, 0) }),
          alphaFrom:
            args.afrom === undefined
              ? undefined
              : clamp(toNumber(args.afrom, 1), 0, 1),
          alphaTo:
            args.ato === undefined
              ? undefined
              : clamp(toNumber(args.ato, 1), 0, 1),
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
          focusMode: this.resolveCharacterSlotFocusMode(args, Boolean(nameRef)),
          focusSlots: this.resolveCharacterSlotFocusSlots(args),
          ...(args.inverse === undefined
            ? {}
            : { inverse: toBoolean(args.inverse, false) }),
          nativeKey: nameRef || undefined,
          positionFrom: this.parseCharacterSlotPoint(args.posfrom),
          positionTo: this.parseCharacterSlotPoint(args.posto),
          posZoom: this.parseCharacterSlotPoint(args.poszoom),
          power: Math.max(0, toNumber(args.power, 0)),
          preserveTransform:
            toString(args.end).trim().toLowerCase() === "false",
          randomness: clamp(toNumber(args.random, 90), 0, 100),
          replaceFadeMs: Math.max(
            0,
            Math.round(toNumber(args.fadetime, 0) * 1000),
          ),
          resetTransform: toString(args.end).trim().toLowerCase() !== "false",
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
          times: Math.trunc(toNumber(args.times, 1)),
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
          const resolved = this.resolveCharacterName(update.name);
          if (!resolved) {
            this.warn("missing_asset", `character: ${update.name}`);
            void this.renderer.clearCharacters(update.slot, durationMs);
            continue;
          }
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
        // Native port: Torappu.AVG.CharacterPanel._ExecuteCharacterAction. It uses
        // literal fadetime and accepts both legacy block spellings.
        const type = this.parseCharacterActionType(args.type);
        if (!type) {
          this.warn(
            "parse",
            `characteraction type is invalid: ${toString(args.type)}`,
          );
          return "continue";
        }
        const slot = this.parseCharacterActionSlot(args.name, type);

        const scaleFallback =
          args.scale === undefined
            ? undefined
            : Math.max(0, toNumber(args.scale, 1));
        const xScale =
          args.xscale === undefined
            ? scaleFallback
            : Math.max(0, toNumber(args.xscale, scaleFallback ?? 1));
        const yScale =
          args.yscale === undefined
            ? scaleFallback
            : Math.max(0, toNumber(args.yscale, scaleFallback ?? 1));

        await this.renderer.runCharacterAction({
          block: toBoolean(args.block, toBoolean(args.isblock, false)),
          direction: this.parseCharacterActionDirection(args.direction),
          durationMs: Math.max(
            0,
            Math.round(toNumber(args.fadetime, 0.5) * 1000),
          ),
          power: Math.max(0, toNumber(args.power, 0)),
          randomness: clamp(toNumber(args.randomness, 90), 0, 100),
          rotationFromDeg: toNumber(args.start, 0),
          rotationLeftDeg:
            args.leftend === undefined ? -15 : -toNumber(args.leftend, 15),
          rotationRightDeg:
            args.rightend === undefined ? 15 : toNumber(args.rightend, 15),
          scaleX: xScale,
          scaleY: yScale,
          slot,
          stop: toBoolean(args.stop, false),
          times: Math.trunc(toNumber(args.times, 1)),
          type,
          xOffset: toNumber(args.xpos, 0),
          yOffset: toNumber(args.ypos, 0),
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
        const resolved = nameRef ? this.resolveCharacterName(nameRef) : null;
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
        const resolvedAvatar =
          type === 3 && name ? this.resolveCharacterName(name) : null;
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
        const rawStyle = toString(this.exactArg(args, "style"));
        const rawSlot = toString(this.exactArg(args, "slot"));
        const styleMap: Record<string, string> = {
          1: "animetext",
          2: "spine",
          3: "effect",
          4: "bgeffect",
          5: "bg",
          6: "animekv",
          7: "character",
        };
        const slotMap: Record<string, string> = {
          1: "bgover",
          2: "charover",
          3: "cgover",
        };
        const style = styleMap[rawStyle] ?? rawStyle;
        const slot = slotMap[rawSlot] ?? rawSlot;
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
        // Audio calls are asynchronous and do not block the command loop.
        const key = toString(this.exactArg(args, "key"));
        if (!key) {
          this.warn("parse", "playmusic key is empty");
          return "continue";
        }
        if (!this.hasAudioKey(key)) {
          this.warn("missing_asset", `music: ${key}`);
          return "continue";
        }

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
        // Channel defaults to key; the call is non-blocking.
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
        // Native port: Torappu.AVG.AVGCameraEffect._ExecuteCameraShake. Duration,
        await this.renderer.shakeCamera({
          block: toBoolean(this.exactArg(args, "block"), false),
          durationMs:
            toNumber(this.exactArg(args, "duration"), -1) < 0
              ? 10_000
              : Math.max(
                  0,
                  toNumber(this.exactArg(args, "duration"), 0) * 1000,
                ),
          fadeOut: toBoolean(this.exactArg(args, "fadeout"), false),
          infinite: toNumber(this.exactArg(args, "duration"), -1) < 0,
          randomness: toNumber(this.exactArg(args, "randomness"), 90),
          stop: toBoolean(this.exactArg(args, "stop"), false),
          vibrato: Math.trunc(toNumber(this.exactArg(args, "vibrato"), 10)),
          xStrength: toNumber(this.exactArg(args, "xstrength"), 1),
          yStrength: toNumber(this.exactArg(args, "ystrength"), 0),
        });
        return "continue";
      }

      case "focusout": {
        // Native port: Torappu.AVG.AVGCameraEffect._ExecuteFocusout. Its duration
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
        // Native port: Torappu.AVG.AVGCameraEffect._ExecuteFocusParam. This is a
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

      case "multiline": {
        // Native port: Torappu.AVG.DialogPanel._ExecuteMultiline. Consecutive
        // fragments append until `end`; they share the typewriter timing model.
        const text = line.trailingText;
        if (!text) {
          this.renderer.setDialogue("", "");
          return "continue";
        }
        // Native port: `AVGTypeWriterText.AppendText` only types the appended
        // fragment -- `OnReset` runs once, when the first multiline of a run
        // starts. Resume from what is already on screen instead of blanking
        // the box and replaying the whole accumulated line.
        const shownChars = this.multilineShownChars;
        this.multilineText += text;
        this.multilineEnd = toBoolean(this.exactArg(args, "end"), false);
        this.displayedLineIndex = line.lineNumber;
        this.startTypingDialogue(
          toString(this.exactArg(args, "name")),
          this.multilineText,
          this.multilineTypeDelayScale(this.exactArg(args, "delay")),
          shownChars,
        );
        this.multilineShownChars = this.currentMessageLength;
        return "wait_input";
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
        await this.renderer.setSubtitle({
          alignment:
            this.parseSubtitleAlignment(this.exactArg(args, "alignment")) ??
            "left",
          delayMs: this.getCurrentSpeed().typeWriterDelayMs,
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

      case "sticker": {
        // Native port: Torappu.AVG.StickerPanel._ExecuteSticker. The state is a
        // multi-id slot dictionary, with show/append/hide behavior selected by id
        const id = toString(this.exactArg(args, "id"));
        if (!id) {
          this.warn("parse", "sticker id is empty");
          return "continue";
        }

        const multi = toBoolean(this.exactArg(args, "multi"), false);
        // `block` defaults differ per branch: true when the id is new (show),
        // false once the id already exists (append or hide).
        const block = toBoolean(
          this.exactArg(args, "block"),
          !this.stickerIds.has(id),
        );
        const duration = toNumber(this.exactArg(args, "duration"), -1);
        // RenderSticker keeps `duration` verbatim when it is >= 0 (0 means an
        // instant show) and only falls back to 0.15 when the parameter is absent.
        // HideSticker is different: it uses 0.15 for anything <= 0.
        const showFadeMs = (duration >= 0 ? duration : 0.15) * 1000;
        const hideFadeMs = (duration > 0 ? duration : 0.15) * 1000;
        if (this.stickerIds.has(id) && !multi) {
          this.stickerIds.delete(id);
          await this.renderer.clearSticker(id, hideFadeMs);
          return block ? "wait_input" : "continue";
        }

        const x = toNumber(this.exactArg(args, "x"), 0);
        const y = toNumber(this.exactArg(args, "y"), 0);
        if (x < 0 || x > 1280 || y < 0 || y > 720) return "continue";
        this.stickerIds.add(id);

        await this.renderer.setSticker({
          alignment:
            this.parseSubtitleAlignment(this.exactArg(args, "alignment")) ??
            "left",
          append: multi,
          delayMs: this.stickerTypeDelayMs(this.exactArg(args, "delay")),
          fadeMs: showFadeMs,
          id,
          sizePx: toNumber(this.exactArg(args, "size"), 24),
          text: this.translateText(toString(this.exactArg(args, "text"))),
          widthPx: Math.min(
            toNumber(this.exactArg(args, "width"), 1280),
            1280 - x,
          ),
          x,
          y,
        } satisfies StickerInput);
        return block ? "wait_input" : "continue";
      }

      case "timersticker": {
        // Native port: Torappu.AVG.StickerPanel._ExcuteTimerSticker. This is a
        await this.renderer.setTimerSticker({
          durationMs:
            Math.max(0, toNumber(this.exactArg(args, "duration"), 1) * 1000) ||
            130,
          fromAlpha: toNumber(this.exactArg(args, "afrom"), 0),
          limitSeconds:
            this.exactArg(args, "time") === undefined
              ? undefined
              : Math.round(toNumber(this.exactArg(args, "time"), -1)),
          sizePx: toNumber(this.exactArg(args, "size"), 24),
          toAlpha: toNumber(this.exactArg(args, "ato"), 1),
          widthPx: toNumber(this.exactArg(args, "width"), 1280),
          x: toNumber(this.exactArg(args, "x"), 0),
          y: toNumber(this.exactArg(args, "y"), 0),
        } satisfies TimerStickerInput);
        return "continue";
      }

      case "timerclear": {
        // Native port: Torappu.AVG.StickerPanel._ExcuteTimerClier / AVGTimerView.
        // StopTimer hides the reusable slot rather than destroying it.
        await this.renderer.clearTimerSticker({
          durationMs: Math.max(
            0,
            toNumber(this.exactArg(args, "duration"), 0.13) * 1000,
          ),
        } satisfies TimerClearInput);
        return "continue";
      }

      case "stickerclear": {
        // Native port: Torappu.AVG.StickerPanel._ExcuteClear / _RecycleStickers.
        // It clears all sticker slots and also stops the timer-sticker path.
        this.stickerIds.clear();
        void this.renderer.clearStickers(150);
        void this.renderer.clearTimerSticker({ durationMs: 0 });
        return toBoolean(this.exactArg(args, "block"), false)
          ? "wait_input"
          : "continue";
      }

      case "spellsticker": {
        // Native port: Torappu.AVG.AVGSpellStickerPanel._ExecuteSpellSticker.
        // `block` waits for a click, whose follow-up hides the sticker.
        const id = toString(this.exactArg(args, "id"));
        if (!id) return "continue";
        const action = toString(this.exactArg(args, "action"), "show");
        const block = toBoolean(this.exactArg(args, "block"), false);
        await (action.toLowerCase() === "hide"
          ? this.renderer.hideSpellSticker(id)
          : this.renderer.setSpellSticker({
              alpha: clamp(toNumber(this.exactArg(args, "alpha"), 1), 0, 1),
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
        const mode = toBoolean(this.exactArg(args, "mode"), true);
        if (mode && !this.theaterMode) {
          this.theaterAutoPlayCache = this.getAutoPlayState();
          this.theaterMode = true;
          this.buttonSpeedLevel = 0;
          this.setAutoPlayMode("button_auto");
        } else if (!mode && this.theaterMode) {
          this.theaterMode = false;
          const cached = this.theaterAutoPlayCache;
          this.theaterAutoPlayCache = null;
          if (cached) {
            this.buttonSpeedLevel = cached.buttonSpeedLevel;
            this.quickSpeedLevel = cached.quickSpeedLevel;
            this.setAutoPlayMode(
              cached.mode === "quick_play" ? "default" : cached.mode,
            );
          }
        }
        return "continue";
      }

      case "decision": {
        // Native port: Torappu.AVG.DecisionPanel._ExecuteDecision. Selection writes
        // a value for the command-loop predicate gate; it is not a label jump.
        this.decisionSelectValue = 0;
        this.decisionReferences = null;
        // options/values 的解析与 Log All 共用 log/semantics.parseDecision，
        // 缺项 value 按原生 `_GetOptionValue` 取 0（闸门对 0 恒放行）
        const parsed = parseDecision(line, this.context.audioVariables);
        if (!parsed) {
          // 无效 decision 同样先重置 value/references 并切回手动（原生
          // 在校验 options 之前就重置）
          this.setAutoPlayMode("default");
          this.warn(
            "invalid_parameter",
            "decision options parameter is missing",
          );
          return "continue";
        }

        const options = parsed.options.map((option) => option.label);
        const values = parsed.options.map((option) => option.value);

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

        const autoPlayCache = this.autoPlayMode;
        this.setAutoPlayMode("default");
        this.state = "waiting_decision";
        const selection = await this.renderer.showDecision(options, values);
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
        this.setAutoPlayMode(autoPlayCache);
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

  private waitForDialogueInput(speaker: string, text: string): void {
    this.startTypingDialogue(speaker, text);
    this.state = "waiting_input";
  }

  private startTypingDialogue(
    speaker: string,
    text: string,
    delayScale = 1,
    startIndex = 0,
  ): void {
    this.cancelTyping();

    const translatedSpeaker = this.translateText(speaker);
    const richChars = parseRichChars(this.translateText(text));
    this.currentMessageLength = richChars.length;
    this.currentTypingComplete = false;
    const initialDelayMs = this.getTypeWriterDelayMs(delayScale);
    const from = clamp(startIndex, 0, richChars.length);
    if (from >= richChars.length || initialDelayMs <= 0) {
      const tagged = richCharsToTaggedText(richChars);
      const colors = collectColors(richChars);
      const ts = colors.length > 0 ? buildTagStyles(colors) : undefined;
      this.renderer.setDialogue(translatedSpeaker, tagged, ts);
      this.onTypingComplete();
      return;
    }

    const sessionId = ++this.typingSessionId;
    const colors = collectColors(richChars);
    const tagStyles = colors.length > 0 ? buildTagStyles(colors) : undefined;
    this.typingSession = {
      id: sessionId,
      speaker: translatedSpeaker,
      richChars,
      tagStyles,
    };
    this.renderer.setDialogue(
      translatedSpeaker,
      richCharsToTaggedText(richChars.slice(0, from)),
      tagStyles,
    );

    void this.runTyping(
      sessionId,
      translatedSpeaker,
      richChars,
      delayScale,
      from,
    );
  }

  private translateText(text: string): string {
    return expandStoryText(text, this.context.audioVariables);
  }

  private getTypeWriterDelayMs(delayScale: number): number {
    const delayMs = this.getCurrentSpeed().typeWriterDelayMs * delayScale;
    return delayMs < 0 ? TYPE_WRITER_ORIGIN_DELAY_MS : delayMs;
  }

  private async runTyping(
    sessionId: number,
    speaker: string,
    richChars: RichChar[],
    delayScale: number,
    startIndex = 0,
  ): Promise<void> {
    for (let index = startIndex; index < richChars.length; index += 1) {
      if (
        !this.typingSession ||
        this.typingSession.id !== sessionId ||
        this.destroyed
      )
        return;

      const delayMs = this.getTypeWriterDelayMs(delayScale);
      if (delayMs > 0) await this.sleep(delayMs);
      if (
        !this.typingSession ||
        this.typingSession.id !== sessionId ||
        this.destroyed
      )
        return;

      const visible = richCharsToTaggedText(richChars.slice(0, index + 1));
      this.renderer.setDialogue(speaker, visible);
    }

    const finalDelayMs = this.getTypeWriterDelayMs(delayScale);
    if (finalDelayMs > 0) await this.sleep(finalDelayMs);
    if (this.typingSession?.id === sessionId) {
      this.typingSession = null;
      this.onTypingComplete();
    }
  }

  private onTypingComplete(): void {
    this.currentTypingComplete = true;
    this.scheduleAutoClick(this.currentMessageLength);
  }

  private finishTypingNow(): boolean {
    if (!this.typingSession) return false;

    const { speaker, richChars, tagStyles } = this.typingSession;
    this.cancelTyping();
    this.renderer.setDialogue(
      speaker,
      richCharsToTaggedText(richChars),
      tagStyles,
    );
    return true;
  }

  private resetMultiline(): void {
    this.multilineText = "";
    this.multilineEnd = false;
    this.multilineShownChars = 0;
  }

  private cancelTyping(): void {
    this.typingSession = null;
    this.typingSessionId += 1;
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

  private resolveCharacterSlotFocusMode(
    args: StoryCommandArgs,
    hasName: boolean,
  ): CharacterSlotInput["focusMode"] | undefined {
    const focus = toString(args.focus).trim().toLowerCase();
    if (!focus) return hasName ? "current_only" : undefined;
    if (focus === "n" || focus === "none") return "none";
    if (focus === "a" || focus === "all") return "subset";
    if (this.resolveCharacterSlotFocusSlots(args)?.length) return "subset";
    return hasName ? "current_only" : undefined;
  }

  private resolveCharacterSlotFocusSlots(
    args: StoryCommandArgs,
  ): string[] | undefined {
    const focus = toString(args.focus).trim().toLowerCase();
    if (!focus) return undefined;
    if (focus === "a" || focus === "all") return ["l", "m", "r"];

    const slots = focus
      .split(",")
      .map((value) => this.parseCharacterSlot(value))
      .filter((slot): slot is string => slot !== undefined);
    return slots.length > 0 ? [...new Set(slots)] : undefined;
  }

  private parseCharacterActionSlot(
    value: unknown,
    type: CharacterActionInput["type"],
  ): string {
    const normalized = toString(value).trim().toLowerCase();
    if (normalized === "left") return "l";
    if (normalized === "right") return "r";
    if (normalized === "middle") return "m";
    return type === "exit" ? "m" : "l";
  }

  private parseCharacterActionType(
    value: unknown,
  ): CharacterActionInput["type"] | undefined {
    const normalized = toString(value).trim().toLowerCase();
    if (
      normalized === "exit" ||
      normalized === "jump" ||
      normalized === "move" ||
      normalized === "shake" ||
      normalized === "zoom"
    ) {
      return normalized;
    }
    return undefined;
  }

  private parseCharacterActionDirection(
    value: unknown,
  ): CharacterActionInput["direction"] | undefined {
    const normalized = toString(value).trim().toLowerCase();
    if (normalized === "left" || normalized === "right") return normalized;
    return undefined;
  }

  private parseSubtitleAlignment(
    value: unknown,
  ): SubtitleInput["alignment"] | undefined {
    const normalized = toString(value).toLowerCase();
    if (
      normalized === "left" ||
      normalized === "center" ||
      normalized === "right"
    )
      return normalized;
    return undefined;
  }
}
