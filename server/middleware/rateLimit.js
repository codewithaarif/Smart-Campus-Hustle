
const requestCounts = new Map();
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 180;
const LOGIN_LIMIT = 10;
const MAX_TRACKED_CLIENTS = 20_000;

function clientAddress(req) {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length <= 256) {
      const first = forwarded.split(',')[0].trim();
      if (first) return first;
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function rateLimiter(req, res, next) {
  const now = Date.now();
  const address = clientAddress(req);
  const pathname = String(req.url || '').split('?')[0];
  const isLogin = req.method === 'POST' && pathname === '/api/auth/login';
  const limit = isLogin ? LOGIN_LIMIT : DEFAULT_LIMIT;
  const key = address + (isLogin ? ':login' : ':general');
  let record = requestCounts.get(key);
  if (!record || now >= record.resetTime) {
    record = { count: 0, resetTime: now + WINDOW_MS };
    requestCounts.set(key, record);
  }
  record.count += 1;

  if (requestCounts.size > MAX_TRACKED_CLIENTS) {
    for (const [entry, value] of requestCounts) {
      if (now >= value.resetTime) requestCounts.delete(entry);
    }
    while (requestCounts.size > MAX_TRACKED_CLIENTS) {
      const oldest = requestCounts.keys().next().value;
      if (oldest === undefined) break;
      requestCounts.delete(oldest);
    }
  }

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - record.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
  if (record.count > limit) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
    res.end(JSON.stringify({ error: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Retry later.' }));
    return;
  }
  next();
}
