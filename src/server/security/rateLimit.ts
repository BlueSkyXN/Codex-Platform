import type express from 'express';

type Bucket = { count: number; resetAt: number };

export function createRateLimiter(windowMs: number, max: number): express.RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const existing = buckets.get(key);
    if (!existing || existing.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    existing.count += 1;
    if (existing.count > max) {
      res.setHeader('retry-after', Math.ceil((existing.resetAt - now) / 1000));
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }
    next();
  };
}
