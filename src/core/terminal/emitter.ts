export class Emitter<EventMap extends Record<string, any>> {
  private listeners = new Map<keyof EventMap, Set<(payload: any) => void>>();

  on<K extends keyof EventMap>(event: K, cb: (payload: EventMap[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb as any);
    return () => {
      set!.delete(cb as any);
      if (set!.size === 0) this.listeners.delete(event);
    };
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) cb(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
