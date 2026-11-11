import {
  exactArg as arg,
  parseSubtitleAlignment,
  parseVector2,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
  TYPE_WRITER_ORIGIN_DELAY_MS,
} from "../commandParams";
import { AVGEvent, type EventPool } from "../eventPool";

import type {
  CommandRegistry,
  CommandResult,
  WaitForClick,
} from "../commandRegistry";
import type {
  ParsedCommandLine,
  StoryRenderer,
  StickerInput,
  StickerTweenInput,
  TimerClearInput,
  TimerStickerInput,
} from "../types";

interface StickerPlayback {
  beginTyping: (messageLength: number) => () => void;
  calculateFadeMs: (value: unknown, fallback?: number) => number;
  typeWriterDelayMs: () => number;
  translateText: (text: string) => string;
  warn: (detail: string) => void;
}

interface StickerSlot {
  id: string;
  rawLength: number;
  layout: Omit<StickerInput, "append" | "id" | "onTypingComplete" | "text">;
}

/**
 * Native provenance: 2791 StickerPanel (GetExecutors 0x1841E1CC0).
 * Owns the five sticker commands, active slots and recycled fade state.
 * Web adaptation: StoryRenderer supplies views; playback owns the shared
 * input/autoplay arbitration. No Pixi dependency is needed to run commands.
 */
export class StickerPanel {
  /**
   * Native port: `StickerPanel.m_stickerDict` — id → live sticker slot. Beyond
   * membership (show/append/hide routing), each slot carries what the native
   * view keeps on itself: the last show's layout and typewriter speed (the
   * append branch must replay them untouched) and the message length for
   * auto-play (`_OnStickerTypeEnd(msgLength)` bills the raw, marked-up text).
   */
  private readonly stickerSlots = new Map<string, StickerSlot>();
  /** Native m_currentSticker, restricted to views that are still visible. */
  private currentSticker: StickerSlot | null = null;

  /**
   * Native port: `StickerPanel.m_recyclePool`, reduced to the one piece of
   * view state that outlives a hide -- `AVGStickerTextView.m_duration`, which
   * every `HideSticker` overwrites. The pool is a FIFO shared by all ids, so a
   * multiline show that keeps the view's fade inherits it from whichever view
   * was recycled first, not from its own id's history.
   */
  private readonly stickerPoolFadeMs: number[] = [];

  constructor(
    private readonly renderer: StoryRenderer,
    private readonly playback: StickerPlayback,
  ) {}

  register(registry: CommandRegistry<CommandResult>): void {
    for (const command of [
      "sticker",
      "stickerclear",
      "stickertween",
      "timersticker",
      "timerclear",
    ])
      registry.register(command, (line) => this.execute(line));
  }

  /** Native OnStoryBegin and _SetTypeWriterDelay (2791 @ 0x1841E21F0 / 0x1841E4980). */
  onStoryBegin(eventPool: EventPool<AVGEvent>): void {
    eventPool.on(AVGEvent.SpeedSet, () => {
      const slot = this.currentSticker;
      if (!slot) return;
      // AVGStickerTextView.SetTypeWriterDelay (0x184245F70) replaces the
      // scaled show interval with the global interval, which later appends keep.
      const delayMs = this.playback.typeWriterDelayMs();
      slot.layout.delayMs = delayMs;
      this.renderer.setStickerTypeWriterDelay(slot.id, delayMs);
    });
  }

  /** Native _OnClicked (2791 @ 0x1841E4500) only finishes the current view. */
  private readonly onClick: WaitForClick = (finishCommand) => {
    const slot = this.currentSticker;
    if (!slot || !this.renderer.finishStickerTyping(slot.id)) finishCommand();
  };

  /** Native OnReset -> _RecycleStickers; timer stops before text is recycled. */
  async reset(): Promise<void> {
    await this.renderer.clearTimerSticker({ durationMs: 0 });
    for (let i = 0; i < this.stickerSlots.size; i += 1)
      this.stickerPoolFadeMs.push(150);
    this.stickerSlots.clear();
    this.currentSticker = null;
    await this.renderer.clearStickers(150);
  }

  /**
   * `delay` on sticker is a scale factor against the asset's `originDelay`
   * (0.04s), not an absolute per-character time: typeWriterDelay = global *
   * delay / originDelay. `delay=0` therefore means "print the whole line at
   * once", which is what the samples writing delay=0 rely on. An omitted
   * `delay` falls back to `StickerPanel._GenParam`'s 1.0 default — a 25x
   * slower typewriter (reachable in data, e.g. the fresh-id multiline show in
   * activities/act23side_02_end.txt:43; appends never re-read it at all).
   * DialogPanel's multiline applies the same ratio with the current delay
   * as its fallback.
   */
  private stickerTypeDelayMs(value: unknown): number {
    const originDelaySeconds = TYPE_WRITER_ORIGIN_DELAY_MS / 1000;
    const scale = toNumber(value, 1) / originDelaySeconds;
    return Math.max(0, this.playback.typeWriterDelayMs() * scale);
  }

  private setSticker(
    text: string,
    slot: StickerSlot,
    append: boolean,
  ): Promise<void> | void {
    const { id } = slot;
    this.stickerSlots.set(id, slot);
    this.currentSticker = slot;
    const onTypeEnd = this.playback.beginTyping(slot.rawLength);
    return this.renderer.setSticker({
      ...slot.layout,
      append,
      id,
      // 2791 _OnStickerTypeEnd (0x1841E4640) reports the completing view's
      // length, even after a different id starts typing.
      onTypingComplete: () => {
        if (this.stickerSlots.get(id) === slot) onTypeEnd();
      },
      text,
    });
  }

  private async execute(line: ParsedCommandLine): Promise<CommandResult> {
    const args = line.args;
    switch (line.command) {
      case "sticker": {
        // Native port: Torappu.AVG.StickerPanel._ExecuteSticker (2.7.61 VA
        // 0x183e924f0). The state is a multi-id slot dictionary: a dict hit
        // with multi=true appends, a dict hit with multi=false hides, and a
        // miss shows.
        const id = toString(arg(args, "id"));
        if (!id) {
          this.playback.warn("sticker id is empty");
          return "continue";
        }

        const multi = toBoolean(arg(args, "multi"), false);
        const existing = this.stickerSlots.get(id);
        // `block` defaults differ per branch: true when the id is new (show),
        // false once the id already exists (append or hide).
        const block = toBoolean(arg(args, "block"), !existing);
        const duration = toNumber(arg(args, "duration"), -1);
        // RenderSticker keeps `duration` verbatim when it is >= 0 (0 means an
        // instant show) and only falls back to 0.15 when the parameter is
        // absent. HideSticker is different: it uses 0.15 for anything <= 0.
        const hideFadeMs = (duration > 0 ? duration : 0.15) * 1000;

        if (existing && !multi) {
          // Hide branch: TryFinishType completes in-flight typing instantly
          // (renderer side), HideSticker fades out and writes its fade into
          // the view's m_duration, the view goes back to the recycle pool,
          // the slot leaves the dict, and RaiseAutoClick(0) keeps auto-play
          // moving with the base wait.
          this.stickerSlots.delete(id);
          // Native points m_currentSticker at the view being hidden, so
          // neither the speed event nor clicks act on another live sticker.
          this.currentSticker = null;
          this.stickerPoolFadeMs.push(hideFadeMs);
          const onHidden = this.playback.beginTyping(0);
          await this.renderer.clearSticker(id, hideFadeMs);
          onHidden();
          return block ? this.onClick : "continue";
        }

        if (existing) {
          // Append branch: the executor only calls
          // AVGStickerTextView.AppendText(view, text) — it never reads
          // x/y/width/size/alignment/duration/delay, so the view keeps the
          // layout and typewriter speed of its last show. Replaying the
          // stored layout (instead of re-defaulting to x=0/y=0) keeps the
          // letter appends in main 13-05, which omit x/y, in place.
          const text = this.playback.translateText(toString(arg(args, "text")));
          await this.setSticker(
            text,
            { ...existing, rawLength: existing.rawLength + text.length },
            true,
          );
          return block ? this.onClick : "continue";
        }

        // Show branch (dict miss): _GenParam reads the full layout. An empty
        // translated text or out-of-range coordinates produce an empty param,
        // which _ExecuteSticker drops silently — no view, and the id never
        // enters the dict, so a later command on the same id still shows.
        const text = this.playback.translateText(toString(arg(args, "text")));
        const x = toNumber(arg(args, "x"), 0);
        const y = toNumber(arg(args, "y"), 0);
        if (x < 0 || x > 1280 || y < 0 || y > 720) return "continue";
        if (!text) return "continue";

        // _GenSticker (2.7.71 VA 0x183f3be10) takes the head of the shared
        // recycle pool (SafeGet(0) + RemoveAt(0)) whatever id it last served;
        // only an empty pool instantiates a new view, whose constructor sets
        // m_duration = 0.15. It refuses that instantiation once pool + dict
        // >= 20 and drops the show; production data never goes past single
        // digits, so warn without dropping.
        const pooledFadeMs = this.stickerPoolFadeMs.shift();
        if (pooledFadeMs === undefined && this.stickerSlots.size >= 20)
          this.playback.warn("avg sticker meets the max num (20)");

        // RenderSticker writes m_duration only when `!isMultiline ||
        // duration >= 0`: a multiline show (multi=true on a fresh id) with no
        // duration keeps the view's previous fade — 0.15 on a new view, or
        // whatever the last HideSticker wrote on a pooled one (e.g. main
        // 15-12_end:77, where st2 reuses st1's view hidden with duration=0.5).
        const showFadeMs =
          multi && duration < 0
            ? (pooledFadeMs ?? 150)
            : (duration >= 0 ? duration : 0.15) * 1000;

        const layout = {
          alignment: parseSubtitleAlignment(arg(args, "alignment")) ?? "left",
          delayMs: this.stickerTypeDelayMs(arg(args, "delay")),
          fadeMs: showFadeMs,
          sizePx: toNumber(arg(args, "size"), 24),
          widthPx: Math.min(toNumber(arg(args, "width"), 1280), 1280 - x),
          x,
          y,
        };
        await this.setSticker(
          text,
          { id, rawLength: text.length, layout },
          false,
        );
        return block ? this.onClick : "continue";
      }

      case "stickertween": {
        // Native port: Torappu.AVG.StickerPanel._ExecuteStickerTween
        // (2791 VA 0x1841E2E40; 2.7.61 0x183e92110), registered under the
        // plaintext key "stickertween" in StickerPanel.GetExecutors. It only
        // tweens an already-shown sticker: `id` comes from TryGetParam and an
        // empty id or a lookup miss in the slot dictionary silently continues
        // -- no warning, no block (same silent-miss contract as hidecgitem).
        const id = toString(arg(args, "id"));
        if (!id || !this.stickerSlots.has(id)) return "continue";

        const join = toBoolean(arg(args, "join"), false);
        const isend = toBoolean(arg(args, "isend"), false);
        const block = toBoolean(arg(args, "block"), false);

        const pto = parseVector2(arg(args, "pto"));
        // `ParseRotateParam` (0x183eae440) reads `rto`/`rfrom` with
        // `TryGetParam(cmd, key, ref float)` and drops the value into the z
        // component of a Vector3 whose x/y stay 0 -- it is a bare float, not
        // a "x,y,z" triple, and anything that does not parse as a float
        // leaves the whole group Empty.
        const rto = toOptionalNumber(arg(args, "rto"));
        const ato = arg(args, "ato");
        // 2791 pushes a fourth group after alpha: `ParseScaleParam`
        // (0x1841FF100) reads `sto` / `sfrom` / `sduration` as floats with the
        // same Empty-unless-`sto` rule, and `_CreateScaleTween` (0x1841FDD40)
        // drives a uniform x/y localScale (z kept). `sfrom` defaults to 0.
        const sto = toOptionalNumber(arg(args, "sto"));
        // With every group Empty, `ExecuteTween` returns before touching the
        // builder, so nothing is pushed and nothing is flushed -- but the
        // `block && isend` check at 0x183e92416 still runs.
        const hasGroup =
          ato !== undefined ||
          pto !== undefined ||
          rto !== undefined ||
          sto !== undefined;
        const tween: StickerTweenInput = {
          // A group is emitted only when its `*to` key parses: native wraps
          // each group in an IEmptyable param and ExecuteTween skips empty
          // groups (missing `*to` yields Empty). `*from` is NOT "the current
          // value": every CommandParser.Parse*Param initializes it to 0 and
          // each AVGTweenFactory._Create*Tween snaps the transform to it
          // before tweening, so an omitted `*from` really is 0.
          ...(ato === undefined
            ? {}
            : {
                alpha: {
                  durationMs: this.playback.calculateFadeMs(
                    arg(args, "aduration"),
                  ),
                  from: toOptionalNumber(arg(args, "afrom")) ?? 0,
                  to: toNumber(ato, 0),
                },
              }),
          id,
          isend,
          join,
          ...(pto === undefined
            ? {}
            : {
                position: {
                  durationMs: this.playback.calculateFadeMs(
                    arg(args, "pduration"),
                  ),
                  from: parseVector2(arg(args, "pfrom")) ?? {
                    x: 0,
                    y: 0,
                  },
                  to: pto,
                },
              }),
          ...(rto === undefined
            ? {}
            : {
                rotation: {
                  durationMs: this.playback.calculateFadeMs(
                    arg(args, "rduration"),
                  ),
                  from: toOptionalNumber(arg(args, "rfrom")) ?? 0,
                  to: rto,
                },
              }),
          ...(sto === undefined
            ? {}
            : {
                scale: {
                  durationMs: this.playback.calculateFadeMs(
                    arg(args, "sduration"),
                  ),
                  from: toOptionalNumber(arg(args, "sfrom")) ?? 0,
                  to: sto,
                },
              }),
        };
        if (hasGroup) await this.renderer.stickerTween(tween);
        // Durations go through calculateFadeMs on purpose: native keeps
        // `*duration` literal and scales playback once via
        // `Sequence.timeScale = AVGController.animateRatio`
        // (AVGStickerTextView.ExecuteTween, VA 0x184165be0 / 0x184165940).
        // Multiplying the duration by the animateRatio captured at execution
        // time is the documented visually-equivalent adaptation and matches
        // how the other tween commands behave here.
        //
        // Native registers the Event.Click advance only when `block && isend`
        // both hold (0x183e92416); the other three combinations return false
        // immediately and the tween keeps playing in the background.
        return block && isend ? this.onClick : "continue";
      }

      case "timersticker": {
        // Native port: Torappu.AVG.StickerPanel._ExcuteTimerSticker. This is a
        // single-slot, never-blocking executor (native returns hardcoded
        // false): the timer view is created once and reused, and only
        // time/x/y/width/size/duration/afrom/ato are read -- id/text/block
        // are ignored.
        await this.renderer.setTimerSticker({
          durationMs:
            Math.max(0, toNumber(arg(args, "duration"), 1) * 1000) || 130,
          fromAlpha: toNumber(arg(args, "afrom"), 0),
          limitSeconds:
            arg(args, "time") === undefined
              ? undefined
              : Math.round(toNumber(arg(args, "time"), -1)),
          sizePx: toNumber(arg(args, "size"), 24),
          toAlpha: toNumber(arg(args, "ato"), 1),
          widthPx: toNumber(arg(args, "width"), 1280),
          x: toNumber(arg(args, "x"), 0),
          y: toNumber(arg(args, "y"), 0),
        } satisfies TimerStickerInput);
        return "continue";
      }

      case "timerclear": {
        // Native port: Torappu.AVG.StickerPanel._ExcuteTimerClier / AVGTimerView.
        // StopTimer hides the reusable slot rather than destroying it.
        await this.renderer.clearTimerSticker({
          durationMs: Math.max(0, toNumber(arg(args, "duration"), 0.13) * 1000),
        } satisfies TimerClearInput);
        return "continue";
      }

      case "stickerclear": {
        // Native port: Torappu.AVG.StickerPanel._ExcuteClear / _RecycleStickers.
        // It clears all sticker slots and also stops the timer-sticker path.
        // Every view enters the recycle pool with m_duration 0.15.
        for (let i = 0; i < this.stickerSlots.size; i += 1)
          this.stickerPoolFadeMs.push(150);
        this.stickerSlots.clear();
        this.currentSticker = null;
        void this.renderer.clearStickers(150);
        void this.renderer.clearTimerSticker({ durationMs: 0 });
        return toBoolean(arg(args, "block"), false) ? this.onClick : "continue";
      }

      default:
        return "continue";
    }
  }
}
