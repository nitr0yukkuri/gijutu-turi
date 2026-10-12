/** Small in-memory abuse guard for the single-instance demo deployment. */
export class RequestRateLimiter {
    maxKeys;
    counters = new Map();
    constructor(maxKeys = 2048) {
        this.maxKeys = maxKeys;
    }
    consume(rules, now = Date.now()) {
        this.removeExpired(now);
        const current = rules.map(rule => ({ rule, counter: this.counters.get(rule.key) }));
        const retryAfter = current.reduce((wait, { rule, counter }) => {
            if (!counter || now >= counter.resetsAt || counter.count < rule.limit)
                return wait;
            return Math.max(wait, Math.ceil((counter.resetsAt - now) / 1000));
        }, 0);
        if (retryAfter > 0)
            return retryAfter;
        const newKeys = new Set(rules.filter(({ key }) => !this.counters.has(key)).map(({ key }) => key));
        if (this.counters.size + newKeys.size > this.maxKeys)
            return 60;
        for (const { rule, counter } of current) {
            if (!counter || now >= counter.resetsAt) {
                this.counters.set(rule.key, { count: 1, resetsAt: now + rule.windowMs });
            }
            else {
                counter.count += 1;
            }
        }
        return 0;
    }
    removeExpired(now) {
        if (this.counters.size < this.maxKeys)
            return;
        for (const [key, counter] of this.counters) {
            if (now >= counter.resetsAt)
                this.counters.delete(key);
        }
    }
}
