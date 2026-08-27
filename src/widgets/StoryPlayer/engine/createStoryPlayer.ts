import { sound } from "@pixi/sound";

import { HtmlStoryAudio } from "./audio";
import { PixiStoryRenderer } from "./renderer";
import { StoryRuntime } from "./runtime";

import type { Context } from "../context";
import type {
  AutoPlayMode,
  PlayerState,
  RuntimeLogPosition,
  StoryPlayer,
} from "./types";

// Register the @pixi/sound loader with PIXI's Assets system. This is a
// side-effecting import: merely `import type` (as audio.ts does) is erased and
// leaves Assets unable to resolve audio URLs, so playMusic/playSound would
// silently no-op. The source repo did this in its main.ts entry; here the
// engine owns its own bootstrap.
sound.disableAutoPause = true;

type DisplayedLineListener = (lineIndex: number | null) => void;

export function createStoryPlayer(context: Context): StoryPlayer {
  let runtime: StoryRuntime | null = null;
  let renderer: PixiStoryRenderer | null = null;
  let audio: HtmlStoryAudio | null = null;
  let mounted = false;
  // destroy() 后 mount() 会重建 runtime，闭包暂存保证监听器不丢
  const displayedLineListeners = new Set<DisplayedLineListener>();
  // 每个监听器在「当前」runtime 上的注销函数。runtime 重建时这张表整体换新，
  // 所以注销必须查表，不能用订阅那一刻捕获的值 —— 那个值属于已经丢弃的 runtime。
  const displayedLineDisposers = new Map<DisplayedLineListener, () => void>();

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
    for (const listener of displayedLineListeners)
      displayedLineDisposers.set(
        listener,
        runtime.onDisplayedLineChange(listener),
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
      // 注销函数跟着被丢弃的 runtime 一起作废；监听器本身留在
      // displayedLineListeners 里等下次 ensureRuntime() 重新挂载
      displayedLineDisposers.clear();
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
      displayedLineListeners.add(listener);
      if (runtime)
        displayedLineDisposers.set(
          listener,
          runtime.onDisplayedLineChange(listener),
        );
      return () => {
        displayedLineListeners.delete(listener);
        displayedLineDisposers.get(listener)?.();
        displayedLineDisposers.delete(listener);
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

    async skipNode(): Promise<void> {
      if (!mounted) throw new Error("StoryPlayer is not mounted yet");
      await ensureRuntime().skipNode();
    },
  };
}
