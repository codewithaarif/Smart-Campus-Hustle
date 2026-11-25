import crypto from 'node:crypto';
import db from '../db/connection.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const QR_SIGNING_SECRET = process.env.QR_SECRET || (IS_PRODUCTION ? '' : 'local-development-qr-secret-change-before-deploy');
if (IS_PRODUCTION && Buffer.byteLength(QR_SIGNING_SECRET) < 32) {
  throw new Error('QR_SECRET must be configured with at least 32 bytes in production.');
}

function safeHexEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeTextEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export class DynamicQRService {
  static generateDynamicIDToken(userId, tenantId) {
    if (!QR_SIGNING_SECRET) throw new Error('QR signing secret is not configured.');
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = userId + ':' + tenantId + ':' + timestamp + ':' + nonce;
    const signature = crypto.createHmac('sha256', QR_SIGNING_SECRET).update(payload).digest('hex');
    const token = Buffer.from(JSON.stringify({
      uid: userId, tid: tenantId, ts: timestamp, n: nonce, sig: signature
    })).toString('base64url');
    return {
      token,
      validUntil: new Date((timestamp + 60) * 1000).toISOString(),
      expiresInSeconds: 60
    };
  }

  static verifyDynamicIDToken(tokenString, expectedTenantId) {
    try {
      if (typeof tokenString !== 'string' || tokenString.length > 2048 ||
          !/^[A-Za-z0-9_-]+$/.test(tokenString)) {
        return { valid: false, error: 'INVALID_QR_PAYLOAD', message: 'Malformed QR code data.' };
      }
      const decoded = JSON.parse(Buffer.from(tokenString, 'base64url').toString('utf8'));
      if (typeof decoded.uid !== 'string' || typeof decoded.tid !== 'string' ||
          !Number.isSafeInteger(decoded.ts) || typeof decoded.n !== 'string' ||
          !/^[a-f0-9]{32}$/.test(decoded.n) || typeof decoded.sig !== 'string') {
        return { valid: false, error: 'INVALID_QR_PAYLOAD', message: 'Malformed QR code data.' };
      }
      if (expectedTenantId && decoded.tid !== expectedTenantId) {
        return { valid: false, error: 'TENANT_MISMATCH', message: 'This ID belongs to a different institution.' };
      }
      const now = Math.floor(Date.now() / 1000);
      if (now - decoded.ts >= 60 || decoded.ts > now + 5) {
        return { valid: false, error: 'TOKEN_EXPIRED', message: 'Dynamic QR code expired. Refresh the ID card.' };
      }
      const payload = decoded.uid + ':' + decoded.tid + ':' + decoded.ts + ':' + decoded.n;
      const expected = crypto.createHmac('sha256', QR_SIGNING_SECRET).update(payload).digest('hex');
      if (!safeHexEqual(decoded.sig, expected)) {
        return { valid: false, error: 'TAMPERED_QR_CODE', message: 'Cryptographic signature mismatch.' };
      }
      const user = db.prepare(`
        SELECT id, university_id, name, role, department, photo_url, card_status, tenant_id
        FROM users WHERE id = ? AND tenant_id = ?
      `).get(decoded.uid, decoded.tid);
      if (!user) return { valid: false, error: 'USER_NOT_FOUND', message: 'User does not exist in this institution.' };
      if (user.card_status !== 'ACTIVE') {
        return { valid: false, error: 'CARD_DISABLED', message: 'University ID card is not active.' };
      }
      db.prepare("DELETE FROM used_qr_tokens WHERE expires_at <= datetime('now')").run();
      const consumed = db.prepare(`
        INSERT OR IGNORE INTO used_qr_tokens (nonce, tenant_id, user_id, expires_at)
        VALUES (?, ?, ?, datetime(?, '+60 seconds'))
      `).run(decoded.n, decoded.tid, decoded.uid, new Date(decoded.ts * 1000).toISOString());
      if (consumed.changes !== 1) {
        return { valid: false, error: 'QR_REPLAYED', message: 'This dynamic QR credential has already been used.' };
      }
      return { valid: true, user, verifiedAt: new Date().toISOString() };
    } catch {
      return { valid: false, error: 'INVALID_QR_PAYLOAD', message: 'Malformed QR code data.' };
    }
  }

  static emergencyGateOverride({ officerId, dualWitnessId, officerPin, reason, studentUniversityId, tenantId }) {
    const configuredPin = process.env.EMERGENCY_OVERRIDE_PIN || '';
    if (!configuredPin || !safeTextEqual(String(officerPin || ''), configuredPin)) {
      return { success: false, message: 'Emergency override is not configured or the credential is invalid.' };
    }
    const safeOfficerId = String(officerId || '').trim();
    const safeWitnessId = String(dualWitnessId || '').trim();
    const safeTenantId = String(tenantId || '').trim();
    const safeReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
    const safeStudentId = String(studentUniversityId || '').trim();
    if (!safeOfficerId || !safeWitnessId || safeOfficerId === safeWitnessId ||
        !safeTenantId || !safeReason || safeReason.length < 8 || !safeStudentId) {
      return { success: false, message: 'Officer, separate witness, student ID, and a detailed reason are required.' };
    }
    const officer = db.prepare('SELECT id, role, tenant_id FROM users WHERE id = ? AND tenant_id = ?')
      .get(safeOfficerId, safeTenantId);
    const witness = db.prepare('SELECT id, role, tenant_id FROM users WHERE id = ? AND tenant_id = ?')
      .get(safeWitnessId, safeTenantId);
    if (!officer || !witness) {
      return { success: false, message: 'Both staff records must belong to the same institution.' };
    }
    const officerRoles = new Set(['SECURITY_GUARD', 'UNIVERSITY_ADMIN']);
    const witnessRoles = new Set(['UNIVERSITY_ADMIN', 'WARDEN', 'COUNSELLOR']);
    if (!officerRoles.has(officer.role) || !witnessRoles.has(witness.role)) {
      return { success: false, message: 'The operator and witness must have authorized staff roles.' };
    }
    const student = db.prepare('SELECT id, name, university_id, role, tenant_id FROM users WHERE university_id = ? AND tenant_id = ?')
      .get(safeStudentId, safeTenantId);
    if (!student || student.role !== 'STUDENT') {
      return { success: false, message: 'Student was not found in this institution.' };
    }
    const overrideLogId = 'gate_emg_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    db.prepare(`
      INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details)
      VALUES (?, ?, ?, 'EMERGENCY_GATE_OVERRIDE', 'TURNSTILE', ?, ?)
    `).run(
      overrideLogId, safeTenantId, safeOfficerId, student.id,
      JSON.stringify({ witness: safeWitnessId, reason: safeReason, overrideTimestamp: new Date().toISOString() })
    );
    return {
      success: true,
      message: 'Emergency override approved and audit record created.',
      student: { id: student.id, name: student.name, university_id: student.university_id },
      auditRecordId: overrideLogId
    };
  }
}
