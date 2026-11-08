import { resolveStoryAudioByKey } from "../../src/widgets/StoryPlayer/engine/asset";

/*
 * Stand-ins for the PIXI sound stack used by HtmlStoryAudio. A spec mocks
 * `pixi.js` with `fakeAssets` and drives loads and plays by hand:
 *
 *   vi.mock("pixi.js", async () => ({
 *     Assets: (await import("./helpers/fakePixiSound")).fakeAssets,
 *   }));
 */

export interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason: Error) => void;
  resolve: (value: T) => void;
}

export function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

/** Minimal stand-in for `@pixi/sound`'s IMediaInstance. */
export class FakeInstance {
  stopped = 0;
  volume = 1;
  stop(): void {
    this.stopped += 1;
  }
}

/**
 * `Sound.play()` returns a Promise whenever the clip is not preloaded. The
 * window between that call and its resolution is where a concurrent
 * stopsound/playsound can orphan the instance, so the fake keeps it open.
 */
export class FakeSound {
  readonly instances: FakeInstance[] = [];
  private pending: Deferred<FakeInstance> | null = null;

  playCalls = 0;
  volume = 1;
  complete?: () => void;

  play(options: {
    volume: number;
    complete?: () => void;
  }): Promise<FakeInstance> {
    this.playCalls++;
    this.volume = options.volume;
    this.complete = options.complete;
    const pending = defer<FakeInstance>();
    this.pending = pending;
    return pending.promise;
  }

  settlePlay(): FakeInstance {
    const pending = this.pending;
    if (!pending) throw new Error("play() was not called");
    this.pending = null;
    const instance = new FakeInstance();
    instance.volume = this.volume;
    this.instances.push(instance);
    pending.resolve(instance);
    return instance;
  }
}

export const loads: Array<Deferred<FakeSound>> = [];
export const preloaded = new Map<string, FakeSound>();

export const fakeAssets = {
  get: (url: string) => preloaded.get(url),
  load: () => {
    const pending = defer<FakeSound>();
    loads.push(pending);
    return pending.promise;
  },
};

export function preloadSound(key: string): FakeSound {
  const clip = new FakeSound();
  preloaded.set(resolveStoryAudioByKey(key)!, clip);
  return clip;
}

export function settleLoad(): FakeSound {
  const pending = loads.shift();
  if (!pending) throw new Error("Assets.load was not called");
  const sound = new FakeSound();
  pending.resolve(sound);
  return sound;
}

/** Let every already-scheduled microtask (each `await`) run to completion. */
export async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

export async function settlePlayback(cached?: FakeSound) {
  await flush();
  const sound = cached ?? settleLoad();
  await flush();
  const instance = sound.settlePlay();
  await flush();
  return { instance, sound };
}
