import crypto from 'node:crypto';
import db from '../db/connection.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? '' : 'local-development-only-change-before-deploy');
const ISSUER = 'smart-campus-hustle';
const AUDIENCE = 'smart-campus-client';
const TOKEN_TTL_SECONDS = 12 * 60 * 60;

if (IS_PRODUCTION && Buffer.byteLength(JWT_SECRET) < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 bytes in production.');
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateToken(user) {
  if (!JWT_SECRET) throw new Error('JWT signing secret is not configured.');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: user.id,
    jti: crypto.randomUUID(),
    userId: user.id,
    universityId: user.university_id,
    email: user.email,
    role: user.role,
    tenantId: user.tenant_id,
    campusId: user.campus_id,
    name: user.name,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  })).toString('base64url');
  const unsigned = header + '.' + payload;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  return unsigned + '.' + signature;
}

export function verifyToken(token) {
  try {
    if (typeof token !== 'string' || token.length > 8192) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    const expected = crypto.createHmac('sha256', JWT_SECRET)
      .update(headerPart + '.' + payloadPart).digest();
    const actual = Buffer.from(signaturePart, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== ISSUER || payload.aud !== AUDIENCE ||
        typeof payload.userId !== 'string' || typeof payload.jti !== 'string' ||
        typeof payload.tenantId !== 'string' ||
        !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat) ||
        payload.exp <= now || payload.iat > now + 30 ||
        payload.exp <= payload.iat || payload.exp - payload.iat > TOKEN_TTL_SECONDS) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    req.user = null;
    return next();
  }
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Use a valid Bearer session token.' }));
    return;
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Session token is invalid or expired.' }));
    return;
  }

  const session = db.prepare(`
    SELECT id FROM user_sessions
    WHERE id = ? AND user_id = ? AND tenant_id = ? AND token = ?
      AND revoked = 0 AND julianday(expires_at) > julianday('now')
  `).get(payload.jti, payload.userId, payload.tenantId, hashSessionToken(token));
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'SESSION_REVOKED', message: 'This session is no longer active. Sign in again.' }));
    return;
  }

  const user = db.prepare(`
    SELECT id, tenant_id, campus_id, university_id, name, email, role,
      department, phone, photo_url, card_status, mfa_enabled
    FROM users WHERE id = ? AND tenant_id = ?
  `).get(payload.userId, payload.tenantId);

  const isIdentityRecovery = req.url?.startsWith('/api/identity/card') ||
    req.url?.startsWith('/api/identity/toggle-card-status') ||
    req.url?.startsWith('/api/auth/me') ||
    req.url?.startsWith('/api/auth/logout') ||
    req.url?.startsWith('/api/saas/tenants');
  if (!user || user.card_status === 'SUSPENDED' ||
      (user.card_status === 'DEACTIVATED' && !isIdentityRecovery)) {
    res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'ACCOUNT_DISABLED', message: 'This account is not active for campus operations.' }));
    return;
  }

  req.user = user;
  req.sessionId = payload.jti;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Authentication required.' }));
      return;
    }
    if (!roles.includes(req.user.role) && req.user.role !== 'PLATFORM_OWNER') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'FORBIDDEN', message: 'Insufficient role permissions.' }));
      return;
    }
    next();
  };
}
