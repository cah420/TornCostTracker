import assert from "node:assert/strict";
import {
  TornRequestQueue,
  TORN_REQUEST_INTERVAL_MS,
} from "./api-queue.js";

function fakeClock(){
  let time = 0;
  const sleeps = [];
  return {
    now: () => time,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      time += milliseconds;
    },
    advance: (milliseconds) => { time += milliseconds; },
    sleeps,
  };
}

async function testSpacingOrderingAndNoConcurrency(){
  const clock = fakeClock();
  const queue = new TornRequestQueue({ now: clock.now, sleep: clock.sleep });
  const starts = [];
  let active = 0;
  let peakActive = 0;
  const task = (name) => async () => {
    starts.push({ name, at: clock.now() });
    active += 1;
    peakActive = Math.max(peakActive, active);
    await Promise.resolve();
    active -= 1;
    return name;
  };

  assert.deepEqual(await Promise.all([queue.enqueue(task("first")), queue.enqueue(task("second")), queue.enqueue(task("third"))]), ["first", "second", "third"]);
  assert.deepEqual(starts.map(({ name }) => name), ["first", "second", "third"]);
  assert.equal(peakActive, 1);
  assert.equal(starts[1].at - starts[0].at, TORN_REQUEST_INTERVAL_MS);
  assert.equal(starts[2].at - starts[1].at, TORN_REQUEST_INTERVAL_MS);
}

async function testIdleQueueCannotBurst(){
  const clock = fakeClock();
  const queue = new TornRequestQueue({ now: clock.now, sleep: clock.sleep });
  const starts = [];
  const task = async () => { starts.push(clock.now()); };
  await queue.enqueue(task);
  clock.advance(60_000);
  await Promise.all([queue.enqueue(task), queue.enqueue(task)]);
  assert.deepEqual(starts, [0, 60_000, 61_200]);
}

async function testFailureAndRateLimitBackoff(){
  const clock = fakeClock();
  const retries = [];
  const queue = new TornRequestQueue({
    now: clock.now,
    sleep: clock.sleep,
    onRateLimitRetry: (retry) => retries.push(retry),
  });
  await assert.rejects(queue.enqueue(async () => { throw new Error("ordinary failure"); }), /ordinary failure/);
  assert.equal(await queue.enqueue(async () => "after failure"), "after failure");

  let attempts = 0;
  const result = await queue.enqueue(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("rate limited");
      error.isTornRateLimit = true;
      throw error;
    }
    return "retried";
  });
  assert.equal(result, "retried");
  assert.equal(attempts, 2);
  assert.deepEqual(retries, [{ retryCount: 1, backoffMs: 5000 }]);
  assert.ok(clock.sleeps.includes(5000), "rate-limit retry waits before it starts again");
}

await testSpacingOrderingAndNoConcurrency();
await testIdleQueueCannotBurst();
await testFailureAndRateLimitBackoff();
assert.equal(TORN_REQUEST_INTERVAL_MS, 1200);
console.log("API queue tests passed.");
