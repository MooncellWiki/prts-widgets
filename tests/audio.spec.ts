import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HtmlStoryAudio } from "../src/widgets/StoryPlayer/engine/audio";

import type { Context } from "../src/widgets/StoryPlayer/context";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Minimal stand-in for `@pixi/sound`'s IMediaInstance. */
class FakeInstance {
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
class FakeSound {
  readonly instances: FakeInstance[] = [];
  private pending: Deferred<FakeInstance> | null = null;

  play(): Promise<FakeInstance> {
    const pending = defer<FakeInstance>();
    this.pending = pending;
    return pending.promise;
  }

  settlePlay(): FakeInstance {
    const pending = this.pending;
    if (!pending) throw new Error("play() was not called");
    this.pending = null;
    const instance = new FakeInstance();
    this.instances.push(instance);
    pending.resolve(instance);
    return instance;
  }
}

const loads: Array<Deferred<FakeSound>> = [];

vi.mock("pixi.js", () => ({
  Assets: {
    get: () => null,
    load: () => {
      const pending = defer<FakeSound>();
      loads.push(pending);
      return pending.promise;
    },
  },
}));

function settleLoad(): FakeSound {
  const pending = loads.shift();
  if (!pending) throw new Error("Assets.load was not called");
  const sound = new FakeSound();
  pending.resolve(sound);
  return sound;
}

/** Let every already-scheduled microtask (each `await`) run to completion. */
async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

/** Drive a full playSound handshake and return its playing instance. */
async function startSound(
  audio: HtmlStoryAudio,
  volume = 1,
  /** A prior load is cached by URL, so a same-key replay reuses its FakeSound. */
  reuse?: FakeSound,
): Promise<{ instance: FakeInstance; sound: FakeSound }> {
  void audio.playSound({
    channel: "c",
    delayMs: 0,
    key: "k",
    loop: true,
    volume,
  });
  await flush();
  const sound = reuse ?? settleLoad();
  await flush();
  const instance = sound.settlePlay();
  await flush();
  return { instance, sound };
}

/** Advance fake rAF frames (~16ms each), draining microtasks in between. */
async function advanceFrames(frames: number): Promise<void> {
  for (let index = 0; index < frames; index += 1) {
    vi.advanceTimersByTime(16);
    await flush();
  }
}

const context = { linkMap: {}, script: [] } satisfies Context;

describe("HtmlStoryAudio", () => {
  beforeEach(() => {
    loads.length = 0;
  });

  it("stops a sound instance that lost its channel while play() was pending", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playSound({
      channel: "c",
      delayMs: 0,
      key: "k",
      loop: true,
      volume: 1,
    });

    await flush();
    const sound = settleLoad();
    await flush();

    // stopsound lands after the channel was claimed but before `play()`
    // resolved, so `sound.instance` is still null and unreachable.
    void audio.stopSound("c", 0);
    const instance = sound.settlePlay();
    await flush();

    expect(instance.stopped).toBe(1);
  });

  it("stops a music instance that lost the channel while play() was pending", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playMusic({ crossfadeMs: 0, delayMs: 0, key: "k", volume: 1 });

    await flush();
    const sound = settleLoad();
    await flush();

    void audio.stopMusic(0);
    const instance = sound.settlePlay();
    await flush();

    expect(instance.stopped).toBe(1);
  });

  it("keeps the instance when the channel is still owned", async () => {
    const audio = new HtmlStoryAudio(context);
    void audio.playSound({
      channel: "c",
      delayMs: 0,
      key: "k",
      loop: true,
      volume: 1,
    });

    await flush();
    const sound = settleLoad();
    await flush();
    const instance = sound.settlePlay();
    await flush();

    expect(instance.stopped).toBe(0);

    await audio.stopSound("c", 0);
    expect(instance.stopped).toBe(1);
  });
});

describe("HtmlStoryAudio stopsound fade (native AudioChannel.Stop tween branch)", () => {
  beforeEach(() => {
    loads.length = 0;
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the channel registered during the fade and removes it when done", async () => {
    const audio = new HtmlStoryAudio(context);
    const { instance } = await startSound(audio);

    void audio.stopSound("c", 1000);
    await flush();
    // Native: the channel stays in m_channels (still playing) while the
    // stop tween runs; only the tween end triggers _Stop + removal.
    expect(instance.stopped).toBe(0);

    await advanceFrames(5);
    expect(instance.volume).toBeGreaterThan(0);
    expect(instance.volume).toBeLessThan(1);
    expect(instance.stopped).toBe(0);

    await advanceFrames(60);
    expect(instance.stopped).toBe(1);

    // The channel entry is gone after the fade: a second stop is a no-op.
    await audio.stopSound("c", 0);
    expect(instance.stopped).toBe(1);
  });

  it("soundvolume during the fade cancels the stop and keeps playing", async () => {
    const audio = new HtmlStoryAudio(context);
    const { instance } = await startSound(audio);

    void audio.stopSound("c", 1000);
    await advanceFrames(10);
    expect(instance.volume).toBeGreaterThan(0);
    expect(instance.volume).toBeLessThan(1);

    // Native: TweenVolume clears m_stopWhenTweenEnd, cancelling the stop.
    await audio.setSoundVolume("c", 0.6, 0);
    await advanceFrames(70);
    expect(instance.stopped).toBe(0);
    expect(instance.volume).toBeCloseTo(0.6);

    // The channel is still resolvable through the same name afterwards.
    await audio.stopSound("c", 0);
    expect(instance.stopped).toBe(1);
  });

  it("a new playsound during the fade cuts the fading instance short", async () => {
    const audio = new HtmlStoryAudio(context);
    const first = await startSound(audio);

    void audio.stopSound("c", 1000);
    await advanceFrames(10);

    // Native: PlayAudio stops the previous channel instance immediately
    // (Stop(0) -> _Stop()); the new sound owns the channel alone.
    const second = await startSound(audio, 1, first.sound);
    expect(first.instance.stopped).toBe(1);
    expect(second.instance.stopped).toBe(0);

    // The stale stop tween must not silence or unregister the new instance.
    await advanceFrames(70);
    expect(second.instance.stopped).toBe(0);
    expect(second.instance.volume).toBe(1);
  });

  it("fadetime <= 0.01s stops instantly without a tween", async () => {
    const audio = new HtmlStoryAudio(context);
    const { instance } = await startSound(audio);

    // Native: fabs(fadetime) <= 0.01 takes the _Stop() branch directly.
    await audio.stopSound("c", 10);
    expect(instance.stopped).toBe(1);
  });
});
