/** Events used by the normal playback path of Torappu.AVG.AVGController. */
export enum AVGEvent {
  Click = 4,
  SpeedSet = 5,
}

type Listener = () => void;

interface Listeners {
  callbacks: Set<Listener>;
  emitDepth: number;
  pending: Array<() => void>;
}

/**
 * Native port: AVGController.eventPool and Torappu.EventPool's
 * AddOrRemoveSafeCallbackSet (2791 Emit @ 0x18698DA70). Duplicate callbacks
 * collapse and changes to a listener set take effect after its outermost emit.
 * The Web playback signals carry no payload, like ON_CLICK and ON_SPEED_SET.
 */
export class EventPool<TEvent> {
  private readonly listeners = new Map<TEvent, Listeners>();

  on(event: TEvent, listener: Listener): () => void {
    const listeners = this.listeners.get(event) ?? {
      callbacks: new Set<Listener>(),
      emitDepth: 0,
      pending: [],
    };
    this.listeners.set(event, listeners);
    this.update(listeners, () => listeners.callbacks.add(listener));
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.update(listeners, () => listeners.callbacks.delete(listener));
    };
  }

  emit(event: TEvent): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    listeners.emitDepth += 1;
    try {
      for (const callback of listeners.callbacks) callback();
    } finally {
      listeners.emitDepth -= 1;
      if (listeners.emitDepth === 0) {
        for (const update of listeners.pending) update();
        listeners.pending.length = 0;
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  private update(listeners: Listeners, change: () => void): void {
    if (listeners.emitDepth === 0) change();
    else listeners.pending.push(change);
  }
}
