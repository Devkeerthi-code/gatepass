/**
 * Fixed-window, in-memory rate limiter. Good enough for one server instance;
 * on serverless each instance has its own window (see README limitations).
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 5000) for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    return true;
  }
  w.count += 1;
  return w.count <= limit;
}
