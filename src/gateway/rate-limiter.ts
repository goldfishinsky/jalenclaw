// src/gateway/rate-limiter.ts

export interface RateLimiterOptions {
  maxRequestsPerMinute: number;
  burstSize: number;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimiter {
  check(ip: string): { allowed: boolean; retryAfterMs?: number };
  reset(): void;
}

/**
 * Create a per-IP rate limiter using the token bucket algorithm.
 * Localhost is rate-limited identically to external IPs.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { maxRequestsPerMinute, burstSize } = options;
  const refillRateMs = 60_000 / maxRequestsPerMinute; // ms per token
  const buckets = new Map<string, TokenBucket>();

  function getBucket(ip: string): TokenBucket {
    let bucket = buckets.get(ip);
    if (!bucket) {
      bucket = { tokens: burstSize, lastRefill: Date.now() };
      buckets.set(ip, bucket);
    }
    return bucket;
  }

  function refill(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed / refillRateMs;
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(burstSize, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  return {
    check(ip: string): { allowed: boolean; retryAfterMs?: number } {
      const bucket = getBucket(ip);
      refill(bucket);

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return { allowed: true };
      }

      // Calculate how long until one token is available
      const retryAfterMs = Math.ceil(refillRateMs * (1 - bucket.tokens));
      return { allowed: false, retryAfterMs };
    },

    reset(): void {
      buckets.clear();
    },
  };
}
