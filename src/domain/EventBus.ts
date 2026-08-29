/** 极简类型化事件总线 */
export class EventBus<Events extends object> {
  private handlers = new Map<keyof Events, Array<(payload: never) => void>>();

  on<E extends keyof Events>(event: E, fn: (payload: Events[E]) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(fn as (payload: never) => void);
    this.handlers.set(event, list);
  }

  off<E extends keyof Events>(event: E, fn: (payload: Events[E]) => void): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(fn as (payload: never) => void);
    if (idx >= 0) list.splice(idx, 1);
  }

  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    const list = this.handlers.get(event);
    if (!list) return;
    for (const fn of list.slice()) fn(payload as never);
  }

  clear(): void {
    this.handlers.clear();
  }
}
