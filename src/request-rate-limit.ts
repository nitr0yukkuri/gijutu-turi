type RateLimitRule = { key: string; limit: number; windowMs: number };
type WindowCounter = { count: number; resetsAt: number };

/** Small in-memory abuse guard for the single-instance demo deployment. */
export class RequestRateLimiter {
  private readonly counters = new Map<string, WindowCounter>();

  constructor(private readonly maxKeys = 2048) {}

  consume(rules: RateLimitRule[], now = Date.now()): number {
    this.removeExpired(now);
    const current = rules.map(rule => ({ rule, counter: this.counters.get(rule.key) }));
    const retryAfter = current.reduce((wait, { rule, counter }) => {
      if (!counter || now >= counter.resetsAt || counter.count < rule.limit) return wait;
      return Math.max(wait, Math.ceil((counter.resetsAt - now) / 1000));
    }, 0);
    if (retryAfter > 0) return retryAfter;
    const newKeys = new Set(rules.filter(({ key }) => !this.counters.has(key)).map(({ key }) => key));
    if (this.counters.size + newKeys.size > this.maxKeys) return 60;

    for (const { rule, counter } of current) {
      if (!counter || now >= counter.resetsAt) {
        this.counters.set(rule.key, { count: 1, resetsAt: now + rule.windowMs });
      } else {
        counter.count += 1;
      }
    }
    return 0;
  }

  private removeExpired(now: number): void {
    if (this.counters.size < this.maxKeys) return;
    for (const [key, counter] of this.counters) {
      if (now >= counter.resetsAt) this.counters.delete(key);
    }
  }
}
