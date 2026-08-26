import { sound } from "@pixi/sound";
import mitt, { type Handler } from "mitt";

import { HtmlStoryAudio } from "./audio";
import { PixiStoryRenderer } from "./renderer";
import { StoryRuntime } from "./runtime";

import type { Context } from "../context";
import type {
  AutoPlayMode,
  DecisionPolicy,
  PlayerState,
  RuntimeLogPosition,
  StoryPlayer,
  StoryPlayerEvents,
} from "./types";

// Register the @pixi/sound loader with PIXI's Assets system. This is a
// side-effecting import: merely `import type` (as audio.ts does) is erased and
// leaves Assets unable to resolve audio URLs, so playMusic/playSound would
// silently no-op. The source repo did this in its main.ts entry; here the
// engine owns its own bootstrap.
sound.disableAutoPause = true;

type DisplayedLineListener = Handler<StoryPlayerEvents["displayedLineChange"]>;

export function createStoryPlayer(context: Context): StoryPlayer {
  let runtime: StoryRuntime | null = null;
  let renderer: PixiStoryRenderer | null = null;
  let audio: HtmlStoryAudio | null = null;
  let mounted = false;
  // destroy() 后 mount() 会重建 runtime。事件总线挂在闭包上，每个 runtime 只往它转发
  // 一次，监听器的生死就与 runtime 无关：旧 runtime 被丢弃时它那份订阅跟着一起没了，
  // 不需要逐个注销再重挂。
  const events = mitt<StoryPlayerEvents>();

  const ensureRuntime = () => {
    if (runtime) return runtime;

    renderer = new PixiStoryRenderer(context, (detail) =>
      console.warn(`[renderer] ${detail}`),
    );
    audio = new HtmlStoryAudio(context);
    runtime = new StoryRuntime(context, renderer, audio, {
      onWarning: (warning) =>
        console.warn(
          "[runtime]",
          warning.type,
          warning.detail ?? "",
          `@${warning.cursor}`,
        ),
      typingIntervalMs: 40,
    });
    // 订阅即补发：新 runtime 会立刻推一次自己的当前值（null），重开一局时
    // 已有监听器的高亮因此自动重置
    runtime.onDisplayedLineChange((lineIndex) =>
      events.emit("displayedLineChange", lineIndex),
    );

    return runtime;
  };

  return {
    async mount(host: HTMLElement): Promise<void> {
      ensureRuntime();
      if (mounted) return;

      await renderer!.mount(host);
      mounted = true;
    },

    async start(): Promise<void> {
      if (!mounted) throw new Error("StoryPlayer is not mounted yet");
      await ensureRuntime().start();
    },

    async advance(): Promise<void> {
      if (!mounted) throw new Error("StoryPlayer is not mounted yet");
      await ensureRuntime().advance();
    },

    canSkipNode(): boolean {
      return ensureRuntime().canSkipNode();
    },

    destroy(): void {
      runtime?.destroy();
      audio?.destroy();
      renderer?.destroy();

      runtime = null;
      audio = null;
      renderer = null;
      mounted = false;
    },

    getAutoPlayState() {
      return ensureRuntime().getAutoPlayState();
    },

    getDecisionSelectValue(): number {
      return runtime?.getDecisionSelectValue() ?? 0;
    },

    getDisplayedLineIndex(): number | null {
      return runtime?.getDisplayedLineIndex() ?? null;
    },

    onDisplayedLineChange(listener: DisplayedLineListener): () => void {
      events.on("displayedLineChange", listener);
      // 与 runtime 一致：订阅即补发当前值（尚未 mount 时为 null）
      listener(runtime?.getDisplayedLineIndex() ?? null);
      return () => {
        events.off("displayedLineChange", listener);
      };
    },

    getLogPosition(): RuntimeLogPosition {
      return runtime?.getLogPosition() ?? { lineIndex: null, selections: [] };
    },

    getState(): PlayerState {
      return runtime?.getState() ?? "idle";
    },

    setAutoPlayMode(mode: AutoPlayMode): void {
      ensureRuntime().setAutoPlayMode(mode);
    },

    setAutoPlaySpeedLevel(level: number): void {
      ensureRuntime().setAutoPlaySpeedLevel(level);
    },

    setDecisionPolicy(policy: DecisionPolicy | null): void {
      ensureRuntime().setDecisionPolicy(policy);
    },

    async skipNode(): Promise<void> {
      if (!mounted) throw new Error("StoryPlayer is not mounted yet");
      await ensureRuntime().skipNode();
    },
  };
}
