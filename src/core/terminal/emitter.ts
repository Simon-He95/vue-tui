const emitterListeners = new WeakMap<Emitter<any>, Map<any, Set<(payload: any) => void>>>();

export class Emitter<EventMap extends Record<string, any>> {
  constructor() {
    emitterListeners.set(this, new Map());
  }

  private getListeners(): Map<keyof EventMap, Set<(payload: any) => void>> {
    return emitterListeners.get(this)!;
  }

  on<K extends keyof EventMap>(event: K, cb: (payload: EventMap[K]) => void): () => void {
    const listeners = this.getListeners();
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(cb as any);
    return () => {
      set!.delete(cb as any);
      if (set!.size === 0) listeners.delete(event);
    };
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.getListeners().get(event);
    if (!set) return;
    for (const cb of set) cb(payload);
  }

  clear(): void {
    this.getListeners().clear();
  }
}
