/**
 * 豆瓣请求守卫：串行队列 + 最小间隔 + 失败退避。
 *
 * 背景：豆瓣对数据中心出口 IP 有风控——并发请求（如启动预热 5 个并行）
 * 会立刻触发 418/403，且风控有记忆期（分钟级），期间所有豆瓣请求快速失败，
 * 整条降级链路被击穿，分类页只能拿到 10 条的 60s 周榜兜底。
 *
 * 策略：
 * - 串行：同一时刻只允许 1 个豆瓣请求在途，其余排队（模拟真人浏览节奏）；
 * - 节流：相邻两个豆瓣请求至少间隔 MIN_INTERVAL_MS；
 * - 退避：连续失败 FAIL_STREAK_LIMIT 次后进入冷却期，冷却内直接拒绝
 *   （调用方走降级链路），避免反复踩风控拖慢响应。
 *
 * 60s API / Bangumi 等非豆瓣源不受本守卫约束。
 */

const MIN_INTERVAL_MS = 900;
const FAIL_STREAK_LIMIT = 3;
const COOLDOWN_MS = 90_000;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
let failStreak = 0;
let cooldownUntil = 0;

/** 退避中抛出的专用错误（调用方可据此静默走降级，不计入链路异常） */
export class DoubanCooldownError extends Error {
  constructor() {
    super('豆瓣请求冷却中');
    this.name = 'DoubanCooldownError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 冷却剩余毫秒（供预热/诊断观察） */
export function cooldownRemaining(): number {
  return Math.max(0, cooldownUntil - Date.now());
}

/**
 * 把一次豆瓣请求放入串行队列执行。
 * 队列内节流 + 退避；fn 的异常原样抛给调用方。
 */
export function runDoubanRequest<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    if (Date.now() < cooldownUntil) throw new DoubanCooldownError();
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const result = await fn();
      failStreak = 0;
      return result;
    } catch (err) {
      failStreak += 1;
      if (failStreak >= FAIL_STREAK_LIMIT) {
        cooldownUntil = Date.now() + COOLDOWN_MS;
      }
      throw err;
    }
  });
  // 无论成败都接续队列，避免单个失败阻塞后续
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
