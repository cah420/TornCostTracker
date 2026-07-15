/**
 * Shared, ordered scheduler for every Torn API request.
 *
 * Requests are serialized and spaced by their start times. Keeping the most
 * recent start time after an idle period prevents a delayed browser timer
 * from releasing more than one request at once.
 */
export const TORN_REQUEST_INTERVAL_MS = 1200;
export const TORN_RATE_LIMIT_INITIAL_BACKOFF_MS = 5000;
export const TORN_RATE_LIMIT_MAX_RETRIES = 3;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class TornRequestQueue {
  constructor({
    intervalMs = TORN_REQUEST_INTERVAL_MS,
    initialBackoffMs = TORN_RATE_LIMIT_INITIAL_BACKOFF_MS,
    maxRateLimitRetries = TORN_RATE_LIMIT_MAX_RETRIES,
    now = () => Date.now(),
    sleep = delay,
    onRateLimitRetry = null,
  } = {}) {
    this.intervalMs = intervalMs;
    this.initialBackoffMs = initialBackoffMs;
    this.maxRateLimitRetries = maxRateLimitRetries;
    this.now = now;
    this.sleep = sleep;
    this.onRateLimitRetry = onRateLimitRetry;
    this.lastStartedAt = null;
    this.tail = Promise.resolve();
  }

  enqueue(task) {
    const scheduled = this.tail.then(() => this.run(task));
    // Keep later queued work alive after an individual request fails.
    this.tail = scheduled.catch(() => undefined);
    return scheduled;
  }

  async run(task) {
    let retryCount = 0;
    while (true) {
      await this.waitForNextStart();
      try {
        return await task();
      } catch (error) {
        if (!error?.isTornRateLimit || retryCount >= this.maxRateLimitRetries) {
          throw error;
        }

        retryCount += 1;
        const backoffMs = this.initialBackoffMs * (2 ** (retryCount - 1));
        this.onRateLimitRetry?.({ retryCount, backoffMs });
        await this.sleep(backoffMs);
      }
    }
  }

  async waitForNextStart() {
    const now = this.now();
    const elapsed = this.lastStartedAt === null ? Infinity : now - this.lastStartedAt;
    const waitMs = Math.max(0, this.intervalMs - elapsed);
    if (waitMs > 0) await this.sleep(waitMs);
    this.lastStartedAt = this.now();
  }
}
