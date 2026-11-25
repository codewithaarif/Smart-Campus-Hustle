import db from '../db/connection.js';
import { generateToken, verifyToken, hashSessionToken } from '../middleware/auth.js';
import { hashPassword, verifyPassword, verifyTotp } from '../security/passwords.js';
import { logAuditEvent } from '../middleware/audit.js';

const sendJson = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
};

export function handleAuthRoutes(req, res, pathname, body) {
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const requestedTenant = typeof body.tenantId === 'string' ? body.tenantId : (req.tenant?.id || '');
    const tenantId = req.tenant?.id;

    if (!email || email.length > 254 || !password || password.length > 1024) {
      sendJson(res, 400, { error: 'INVALID_REQUEST', message: 'Enter a valid email address and password.' });
      return true;
    }
    if (!tenantId || requestedTenant !== tenantId) {
      sendJson(res, 403, { error: 'TENANT_MISMATCH', message: 'Login tenant does not match the selected institution.' });
      return true;
    }

    const user = db.prepare('SELECT * FROM users WHERE lower(email) = ? AND tenant_id = ?')
      .get(email, tenantId);
    const passwordCheck = user
      ? verifyPassword(password, user.password_hash)
      : { valid: false, needsRehash: false };

    if (!user || !passwordCheck.valid) {
      sendJson(res, 401, { error: 'INVALID_CREDENTIALS', message: 'Invalid university email or password.' });
      return true;
    }
    if (user.card_status === 'SUSPENDED') {
      sendJson(res, 403, { error: 'ACCOUNT_SUSPENDED', message: 'This account is suspended. Contact the university administrator.' });
      return true;
    }
    if (user.mfa_enabled) {
      if (!user.mfa_secret) {
        sendJson(res, 403, { error: 'MFA_NOT_CONFIGURED', message: 'MFA is enabled but no authenticator secret is configured. Contact an administrator.' });
        return true;
      }
      const code = typeof body.mfaCode === 'string' ? body.mfaCode.trim() : '';
      if (!verifyTotp(user.mfa_secret, code)) {
        sendJson(res, 401, { error: 'MFA_REQUIRED', message: 'A valid six-digit authenticator code is required.' });
        return true;
      }
    }

    if (passwordCheck.needsRehash) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND tenant_id = ?')
        .run(hashPassword(password), user.id, tenantId);
    }

    const token = generateToken(user);
    const payload = verifyToken(token);
    if (!payload) throw new Error('Could not validate the newly generated session token.');
    const expiresAt = new Date(payload.exp * 1000).toISOString().replace('T', ' ').replace('Z', '');
    db.prepare(`
      INSERT INTO user_sessions
        (id, user_id, tenant_id, token, ip_address, user_agent, expires_at, revoked)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      payload.jti,
      user.id,
      tenantId,
      hashSessionToken(token),
      req.socket?.remoteAddress || null,
      String(req.headers['user-agent'] || '').slice(0, 500),
      expiresAt
    );

    logAuditEvent(tenantId, user.id, 'LOGIN', 'SESSION', payload.jti,
      req.socket?.remoteAddress, { mode: user.mfa_enabled ? 'PASSWORD_MFA' : 'PASSWORD', success: true });

    sendJson(res, 200, {
      token,
      user: {
        id: user.id,
        universityId: user.university_id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        tenantId: user.tenant_id,
        campusId: user.campus_id,
        photoUrl: user.photo_url,
        cardStatus: user.card_status,
        mfaEnabled: Boolean(user.mfa_enabled)
      }
    });
    return true;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    if (!req.user || !req.sessionId) {
      sendJson(res, 401, { error: 'UNAUTHORIZED' });
      return true;
    }
    db.prepare('UPDATE user_sessions SET revoked = 1 WHERE id = ? AND user_id = ? AND tenant_id = ?')
      .run(req.sessionId, req.user.id, req.user.tenant_id);
    logAuditEvent(req.user.tenant_id, req.user.id, 'LOGOUT', 'SESSION', req.sessionId,
      req.socket?.remoteAddress, {});
    sendJson(res, 200, { success: true });
    return true;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (!req.user) {
      sendJson(res, 401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const tenant = db.prepare('SELECT id, name, slug, domain, logo_url, primary_color, secondary_color, subscription_plan, subscription_status FROM tenants WHERE id = ?')
      .get(req.user.tenant_id);
    const campuses = db.prepare('SELECT id, tenant_id, name, code, address, city FROM campuses WHERE tenant_id = ?')
      .all(req.user.tenant_id);
    sendJson(res, 200, { user: req.user, tenant, campuses });
    return true;
  }

  if (pathname === '/api/auth/demo-users' && req.method === 'GET') {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEMO_ENDPOINTS !== 'true') {
      sendJson(res, 404, { error: 'NOT_FOUND' });
      return true;
    }
    const users = db.prepare(`
      SELECT u.id, u.university_id, u.name, u.email, u.role, u.department, u.photo_url,
        u.tenant_id, t.name AS tenant_name
      FROM users u JOIN tenants t ON t.id = u.tenant_id
      WHERE u.card_status = 'ACTIVE'
      ORDER BY u.role, u.name
    `).all();
    sendJson(res, 200, { users });
    return true;
  }

  return false;
}
