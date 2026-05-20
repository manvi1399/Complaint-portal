const AUTH_WINDOW_MS = 15 * 60 * 1000;

export class AuthRateLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  check(key: string, maxAttempts: number) {
    const now = Date.now();
    const existing = this.attempts.get(key);

    if (!existing || existing.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
      return null;
    }

    if (existing.count >= maxAttempts) {
      return {
        error: `Too many attempts. Try again after ${new Date(existing.resetAt).toLocaleTimeString()}.`,
      };
    }

    existing.count += 1;
    return null;
  }

  clear(key: string) {
    this.attempts.delete(key);
  }
}
