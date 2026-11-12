/**
 * Note: This simple in-memory rate limiter resets on server restart and is local to this
 * Node process. If scaled to multiple server instances or serverless clusters, rate limiting
 * should move to the database or a shared caching store (such as Redis or Memcached).
 */

interface RateLimitConfig {
  max: number;
  windowMs: number;
}

const rateLimitStore = new Map<string, number[]>();

// Periodically clean up stale entries (every 10 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of rateLimitStore.entries()) {
      const validTimestamps = timestamps.filter((time) => now - time < 3600_000); // 1 hour max window
      if (validTimestamps.length === 0) {
        rateLimitStore.delete(key);
      } else {
        rateLimitStore.set(key, validTimestamps);
      }
    }
  }, 10 * 60 * 1000).unref?.();
}

/**
 * Extracts the client's IP address from request headers.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) return ip;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "127.0.0.1";
}

/**
 * Core limiter logic for a given key, limit, and window.
 */
function isRateLimited(key: string, config: RateLimitConfig, consume: boolean = true): boolean {
  const now = Date.now();
  const timestamps = rateLimitStore.get(key) || [];

  // Remove timestamps outside the sliding window
  const activeTimestamps = timestamps.filter((time) => now - time < config.windowMs);

  if (activeTimestamps.length >= config.max) {
    rateLimitStore.set(key, activeTimestamps);
    return true;
  }

  if (consume) {
    activeTimestamps.push(now);
    rateLimitStore.set(key, activeTimestamps);
  } else {
    rateLimitStore.set(key, activeTimestamps);
  }

  return false;
}

/**
 * Login: max 5 failed attempts per 15 minutes per IP+email.
 */
const LOGIN_CONFIG: RateLimitConfig = {
  max: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

export function checkLoginRateLimit(ip: string, email: string): boolean {
  const key = `login:${ip}:${email.toLowerCase().trim()}`;
  return isRateLimited(key, LOGIN_CONFIG, false);
}

export function recordFailedLogin(ip: string, email: string): void {
  const key = `login:${ip}:${email.toLowerCase().trim()}`;
  isRateLimited(key, LOGIN_CONFIG, true);
}

export function clearLoginRateLimit(ip: string, email: string): void {
  const key = `login:${ip}:${email.toLowerCase().trim()}`;
  rateLimitStore.delete(key);
}

/**
 * Register: max 5 per hour per IP.
 */
const REGISTER_CONFIG: RateLimitConfig = {
  max: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
};

export function checkRegisterRateLimit(ip: string): boolean {
  const key = `register:${ip}`;
  return isRateLimited(key, REGISTER_CONFIG, true);
}

/**
 * Submit: max 10 per hour per user.
 */
const SUBMIT_CONFIG: RateLimitConfig = {
  max: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
};

export function checkSubmitRateLimit(userId: string): boolean {
  const key = `submit:${userId}`;
  return isRateLimited(key, SUBMIT_CONFIG, true);
}

/**
 * Report: max 5 per hour per IP.
 */
const REPORT_CONFIG: RateLimitConfig = {
  max: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
};

export function checkReportRateLimit(ip: string): boolean {
  const key = `report:${ip}`;
  return isRateLimited(key, REPORT_CONFIG, true);
}

/**
 * Creates a standard friendly 429 Too Many Requests response.
 */
export function createRateLimitResponse(
  message: string = "Too many requests. Please slow down and try again later."
): Response {
  return new Response(message, {
    status: 429,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": "900",
    },
  });
}
