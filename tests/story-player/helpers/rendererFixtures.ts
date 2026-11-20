import {
  Application,
  Assets,
  Texture,
  TextureSource,
  TickerPlugin,
} from "pixi.js";
import { vi } from "vitest";

import { preloadContextAssets } from "../../../src/widgets/StoryPlayer/engine/preload";
import { PixiStoryRenderer } from "../../../src/widgets/StoryPlayer/engine/renderer";
import { StoryRuntime } from "../../../src/widgets/StoryPlayer/engine/runtime";

import { PlaybackTestFrames } from "./playbackFrames";
import {
  createContext as createPlaybackContext,
  FakeAudio,
} from "./runtimeFakes";

import type { Context } from "../../../src/widgets/StoryPlayer/context";
import type { AnimationClock } from "../../../src/widgets/StoryPlayer/engine/execution";
import type { LayerGraph } from "../../../src/widgets/StoryPlayer/engine/rendering/core/LayerGraph";

export function createContext(): Context {
  return {
    linkMap: {},
    script: [],
  };
}

// The specs drive the renderer's private state and methods directly; keep
// that cast in this one place instead of repeating it in every test.
export function createRenderer(
  context: Context = createContext(),
  onWarning?: (detail: string) => void,
  now?: () => number,
): any {
  const frames = new PlaybackTestFrames();
  let tickerTime: number | undefined;
  const renderer: PixiStoryRenderer = new PixiStoryRenderer(
    context,
    onWarning,
    now ?? (() => renderer.currentFrameTimeMs ?? tickerTime ?? frames.now()),
  );
  const onFrameEnd = renderer.onFrameEnd.bind(renderer);
  const onFrameUpdate = renderer.onFrameUpdate.bind(renderer);
  return Object.assign(renderer, {
    frames,
    onFrameEnd: ((callback) =>
      (renderer as any).app?.ticker
        ? onFrameEnd(callback)
        : frames.onFrameEnd(
            callback,
          )) satisfies PixiStoryRenderer["onFrameEnd"],
    onFrameUpdate: ((callback, phase) =>
      (renderer as any).app?.ticker
        ? onFrameUpdate((frame) => {
            tickerTime = frame.nowMs;
            callback(frame);
          }, phase)
        : frames.onFrameUpdate(
            callback,
            phase,
          )) satisfies PixiStoryRenderer["onFrameUpdate"],
  }) as any;
}

export function createManualClock(): {
  advance: (ms: number) => void;
  clock: AnimationClock;
  drainFrame: () => void;
} {
  const frames: Array<() => void> = [];
  let now = 0;
  const clock: AnimationClock = {
    cancelFrame: () => {},
    now: () => now,
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
  };
  return {
    advance: (ms) => {
      now += ms;
    },
    clock,
    drainFrame: () => {
      const frame = frames.shift();
      if (frame) frame();
    },
  };
}

export async function createRenderedPlayback(
  script: string[] | Context,
  draw: (layers: LayerGraph) => void,
  characters?: Context["linkMap"],
) {
  const context = Array.isArray(script)
    ? createPlaybackContext(script)
    : script;
  Object.assign(context.linkMap, characters);
  const urls = new Set<string>();
  const load = vi.spyOn(Assets, "load").mockImplementation(async (assets) => {
    const textures: Record<string, Texture> = {};
    for (const url of assets as string[]) {
      const label = url.split("/").at(-1)?.split(".")[0];
      const source = new TextureSource({ height: 32, width: 32 });
      textures[url] = new Texture({ label, source });
      Assets.cache.set(url, textures[url]);
      urls.add(url);
    }
    return textures;
  });
  try {
    await preloadContextAssets(context);
  } finally {
    load.mockRestore();
  }
  const renderer = createRenderer(context);
  const app = new Application();
  app.render = () => draw(renderer.layers);
  TickerPlugin.init.call(app, { autoStart: false });
  renderer.app = app;
  renderer.layers.attach(app.stage);
  app.ticker.lastTime = 0;
  const runtime = new StoryRuntime(context, renderer, new FakeAudio());
  return {
    app,
    destroy() {
      runtime.destroy();
      renderer.app = null;
      renderer.destroy();
      app.ticker.destroy();
      app.stage.destroy({ children: true });
      for (const url of urls) Assets.cache.remove(url);
    },
    renderer,
    runtime,
  };
}
