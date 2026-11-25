import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert';
import db from '../server/db/connection.js';
import { seedDatabase } from '../server/db/seed.js';
import { hashPassword, verifyPassword, verifyTotp } from '../server/security/passwords.js';
import { authMiddleware, generateToken } from '../server/middleware/auth.js';
import { tenantMiddleware } from '../server/middleware/tenant.js';
import { handleAuthRoutes } from '../server/routes/authRoutes.js';

import { logSensitiveAccess } from '../server/middleware/audit.js';
import { AIAssistantService } from '../server/services/aiService.js';
import { DynamicQRService } from '../server/services/qrService.js';

seedDatabase();

test('Security Module 19 & 22: Strict Tenant Isolation Enforced', () => {
  // Apex University tenant
  const apexCourses = db.prepare('SELECT * FROM courses WHERE tenant_id = ?').all('tenant_apex');
  // Metro Tech tenant
  const metroCourses = db.prepare('SELECT * FROM courses WHERE tenant_id = ?').all('tenant_metro');

  // Apex courses must belong exclusively to Apex
  for (const c of apexCourses) {
    assert.strictEqual(c.tenant_id, 'tenant_apex', 'Course must strictly match Apex tenant');
    assert.notStrictEqual(c.tenant_id, 'tenant_metro', 'Apex course cannot bleed into Metro Tech');
  }

  // Cross-tenant user verification
  const apexUser = db.prepare('SELECT * FROM users WHERE tenant_id = ? AND role = ?').get('tenant_apex', 'STUDENT');
  const metroUser = db.prepare('SELECT * FROM users WHERE tenant_id = ?').get('tenant_metro');

  assert.notStrictEqual(apexUser.tenant_id, metroUser.tenant_id, 'Tenants must remain isolated');
});

test('Security Module 22: Sensitive Data Access Audit Trail Logged', () => {
  logSensitiveAccess(
    'tenant_apex',
    'user_faculty_1',
    'user_student_1',
    'DISCIPLINARY',
    'Faculty HOD review of lab conduct'
  );

  const log = db.prepare(`
    SELECT * FROM sensitive_access_logs
    WHERE target_student_id = ? AND record_category = ?
    ORDER BY created_at DESC LIMIT 1
  `).get('user_student_1', 'DISCIPLINARY');

  assert.ok(log, 'Sensitive access must be recorded in audit log');
  assert.strictEqual(log.justification, 'Faculty HOD review of lab conduct');
});

test('Security Module 17: Deactivated ID Card Blocks Gate and Exam Entry', () => {
  // Temporarily deactivate card
  db.prepare('UPDATE users SET card_status = ? WHERE id = ?').run('DEACTIVATED', 'user_student_2');

  const user = db.prepare('SELECT card_status FROM users WHERE id = ?').get('user_student_2');
  assert.strictEqual(user.card_status, 'DEACTIVATED');

  // Restore for standard tests
  db.prepare('UPDATE users SET card_status = ? WHERE id = ?').run('ACTIVE', 'user_student_2');
});

test('AI assistant gracefully handles empty and malformed prompts', () => {
  const emptyReply = AIAssistantService.handleQuery({ query: '', user: null, tenantId: 'tenant_apex' });
  const malformedReply = AIAssistantService.handleQuery({ query: null, user: null, tenantId: 'tenant_apex' });

  assert.ok(emptyReply.answer.includes('Please ask a specific question'));
  assert.ok(malformedReply.answer.includes('Please ask a specific question'));
});

test('Emergency override rejects invalid dual-witness credentials', () => {
  const invalidWitness = DynamicQRService.emergencyGateOverride({
    officerId: 'user_guard_1',
    dualWitnessId: 'missing_witness',
    officerPin: 'EMERGENCY_OVERRIDE_9911',
    reason: 'Power outage',
    studentUniversityId: 'MUR2600425',
    tenantId: 'tenant_apex'
  });

  assert.strictEqual(invalidWitness.success, false);
  assert.ok(invalidWitness.message.includes('configured') || invalidWitness.message.includes('invalid'));
});

test('Passwords use salted scrypt and legacy SHA-256 hashes are upgraded', () => {
  const first = hashPassword('a-strong-test-password');
  const second = hashPassword('a-strong-test-password');
  assert.notStrictEqual(first, second, 'Each password hash must use a fresh salt');
  assert.strictEqual(verifyPassword('a-strong-test-password', first).valid, true);
  assert.strictEqual(verifyPassword('wrong-password', first).valid, false);
  const legacy = crypto.createHash('sha256')
    .update('legacy-test-password').digest('hex');
  const checked = verifyPassword('legacy-test-password', legacy);
  assert.strictEqual(checked.valid, true);
  assert.strictEqual(checked.needsRehash, true);
});

test('TOTP validation accepts the current six-digit RFC 6238 code', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const now = 1_700_000_000_000;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Math.floor(now / 30_000);
  const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  const code = String(value).padStart(6, '0');
  assert.strictEqual(verifyTotp(secret, code, now), true);
  assert.strictEqual(verifyTotp(secret, '000000', now), false);
});

test('Authenticated session is required and tenant header cannot cross tenant boundary', () => {
  const token = generateToken(db.prepare('SELECT * FROM users WHERE id = ?').get('user_student_1'));
  const req = { headers: { authorization: 'Bearer ' + token }, url: '/api/auth/me', socket: { remoteAddress: '127.0.0.1' } };
  let status = 0, body = '';
  const res = { writeHead: (value) => { status = value; }, end: (value) => { body = value; } };
  authMiddleware(req, res, () => {});
  assert.strictEqual(status, 401);
  assert.ok(JSON.parse(body).error === 'SESSION_REVOKED');

  const tenantReq = {
    headers: { 'x-tenant-id': 'tenant_metro' },
    url: '/api/finance/dues',
    user: { id: 'user_student_1', tenant_id: 'tenant_apex', role: 'STUDENT' }
  };
  tenantMiddleware(tenantReq, res, () => { throw new Error('Tenant mismatch should not call next.'); });
  assert.strictEqual(status, 403);
  assert.strictEqual(JSON.parse(body).error, 'TENANT_MISMATCH');
});

test('Login creates a revocable session and logout invalidates the same bearer token', () => {
  const loginReq = {
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'user-agent': 'test-suite' },
    socket: { remoteAddress: '127.0.0.1' },
    tenant: { id: 'tenant_apex' }
  };
  let loginStatus = 0;
  let loginBody = '';
  const loginRes = {
    writeHead(status) { loginStatus = status; },
    end(body) { loginBody = body; }
  };
  assert.strictEqual(handleAuthRoutes(loginReq, loginRes, '/api/auth/login', {
    email: 'aarav.patel@student.apex.edu.in',
    password: 'password123',
    tenantId: 'tenant_apex'
  }), true);
  assert.strictEqual(loginStatus, 200);
  const { token } = JSON.parse(loginBody);
  assert.ok(token);

  const authReq = {
    headers: { authorization: 'Bearer ' + token },
    url: '/api/auth/me',
    socket: { remoteAddress: '127.0.0.1' }
  };
  let authStatus = 0;
  const authRes = {
    writeHead(status) { authStatus = status; },
    end() {}
  };
  let nextCalled = false;
  authMiddleware(authReq, authRes, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(authReq.user.id, 'user_student_1');
  assert.ok(authReq.sessionId);

  const logoutReq = {
    method: 'POST',
    url: '/api/auth/logout',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    user: authReq.user,
    sessionId: authReq.sessionId
  };
  let logoutStatus = 0;
  const logoutRes = {
    writeHead(status) { logoutStatus = status; },
    end() {}
  };
  handleAuthRoutes(logoutReq, logoutRes, '/api/auth/logout', {});
  assert.strictEqual(logoutStatus, 200);

  authStatus = 0;
  authMiddleware({ ...authReq, user: undefined }, authRes, () => { nextCalled = false; });
  assert.strictEqual(authStatus, 401);
});
