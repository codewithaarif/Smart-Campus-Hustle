import crypto from 'node:crypto';
import db from '../db/connection.js';
import { AIAssistantService } from '../services/aiService.js';
import { DynamicQRService } from '../services/qrService.js';
import { WorkflowEngine } from '../services/workflowEngine.js';
import { logAuditEvent, logSensitiveAccess } from '../middleware/audit.js';

export function handleIdentitySaasRoutes(req, res, pathname, body) {
  const tenantId = (req.tenant && req.tenant.id) || 'tenant_apex';
  const userId = req.user ? req.user.id : null;
  const sendJson = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
  };
  const hasRole = (...roles) => !!req.user && (roles.includes(req.user.role) || req.user.role === 'PLATFORM_OWNER');


  // =========================================================================
  // MODULE 9 & 10: AI ASSISTANT & SUCCESS ANALYTICS
  // =========================================================================
  if (pathname === '/api/ai/chat' && req.method === 'POST') {
    if (!req.user) { sendJson(401, { error: 'UNAUTHORIZED' }); return true; }
    const { query } = body;
    const response = AIAssistantService.handleQuery({
      query,
      user: req.user,
      tenantId
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
    return true;
  }

  if (pathname === '/api/ai/success-analytics' && req.method === 'GET') {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return true;
    }

    if (req.user.role !== 'STUDENT') {
      sendJson(403, { error: 'STUDENT_ONLY' });
      return true;
    }
    const metrics = db.prepare('SELECT * FROM student_success_metrics WHERE student_id = ? AND tenant_id = ?')
      .get(req.user.id, tenantId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      metrics: metrics ? {
        ...metrics,
        explainableRiskFactors: JSON.parse(metrics.explainable_risk_factors || '[]'),
        supportRecommendations: JSON.parse(metrics.support_recommendations || '[]')
      } : null
    }));
    return true;
  }

  // =========================================================================
  // MODULE 17: CENTRAL DIGITAL IDENTITY & SMART CARDS
  // =========================================================================
  if (pathname === '/api/identity/card' && req.method === 'GET') {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return true;
    }

    const user = db.prepare(`
      SELECT id, tenant_id, campus_id, university_id, name, email, role, department,
        phone, photo_url, card_status, mfa_enabled
      FROM users
      WHERE id = ? AND tenant_id = ?
    `).get(req.user.id, tenantId);
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'USER_NOT_FOUND' }));
      return true;
    }

    const tenant = db.prepare('SELECT name, logo_url, primary_color FROM tenants WHERE id = ?').get(tenantId);
    const dynamicQR = user.card_status === 'ACTIVE'
      ? DynamicQRService.generateDynamicIDToken(req.user.id, tenantId)
      : null;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      user,
      tenant,
      dynamicQR,
      authorizedZones: ['ACADEMIC_BLOCK', 'CENTRAL_LIBRARY', 'SPORTS_ARENA', 'HOSTEL_RESIDENCE']
    }));
    return true;
  }

  if (pathname === '/api/identity/verify-qr' && req.method === 'POST') {
    if (!hasRole('SECURITY_GUARD', 'UNIVERSITY_ADMIN', 'CAMPUS_ADMIN')) {
      sendJson(req.user ? 403 : 401, { error: req.user ? 'FORBIDDEN' : 'UNAUTHORIZED', message: 'Only authorized security staff can verify identity QR credentials.' });
      return true;
    }
    const { qrToken } = body;
    const verification = DynamicQRService.verifyDynamicIDToken(qrToken, tenantId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(verification));
    return true;
  }

  if (pathname === '/api/identity/toggle-card-status' && req.method === 'POST') {
    if (!req.user) { sendJson(401, { error: 'UNAUTHORIZED' }); return true; }
    const status = body.status;
    if (!['ACTIVE', 'DEACTIVATED'].includes(status)) {
      sendJson(400, { error: 'INVALID_CARD_STATUS' });
      return true;
    }
    // Users may lock their own lost card, but only campus administrators can
    // reactivate a deactivated credential.
    if (status === 'ACTIVE' && !hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN')) {
      sendJson(403, { error: 'ADMIN_REACTIVATION_REQUIRED', message: 'Contact the campus administration to reactivate a deactivated ID card.' });
      return true;
    }
    const targetUserId = status === 'DEACTIVATED'
      ? req.user.id
      : (typeof body.userId === 'string' ? body.userId : req.user.id);
    const target = db.prepare('SELECT id, card_status FROM users WHERE id = ? AND tenant_id = ?')
      .get(targetUserId, tenantId);
    if (!target) { sendJson(404, { error: 'USER_NOT_FOUND' }); return true; }
    const changed = db.prepare('UPDATE users SET card_status = ? WHERE id = ? AND tenant_id = ? AND card_status != ?')
      .run(status, targetUserId, tenantId, status);
    logAuditEvent(tenantId, req.user.id, 'CARD_STATUS_UPDATE', 'IDENTITY', targetUserId,
      req.socket?.remoteAddress, { newStatus: status });
    sendJson(200, { success: true, changed: changed.changes, newStatus: status, userId: targetUserId });
    return true;
  }

  if (pathname === '/api/identity/verify-certificate' && req.method === 'POST') {
    if (!req.user) { sendJson(401, { error: 'UNAUTHORIZED' }); return true; }
    const credential = typeof body.credential === 'string' ? body.credential.trim() : '';
    if (!credential || credential.length > 128) {
      sendJson(400, { error: 'INVALID_CREDENTIAL' });
      return true;
    }
    const certificate = db.prepare(`
      SELECT dc.id, dc.tenant_id, dc.certificate_type, dc.title, dc.issue_date,
        dc.cryptographic_hash, dc.pdf_url, u.name AS student_name, u.university_id
      FROM digital_certificates dc
      JOIN users u ON u.id = dc.user_id
      WHERE dc.tenant_id = ? AND (lower(dc.cryptographic_hash) = lower(?) OR dc.id = ?)
    `).get(tenantId, credential, credential);
    if (!certificate) {
      sendJson(404, { valid: false, error: 'CERTIFICATE_NOT_FOUND', message: 'Certificate not found in this institution registry.' });
      return true;
    }
    logAuditEvent(tenantId, req.user.id, 'CERTIFICATE_VERIFY', 'CERTIFICATE',
      certificate.id, req.socket?.remoteAddress, {});
    sendJson(200, {
      valid: true,
      certificate: {
        id: certificate.id,
        type: certificate.certificate_type,
        title: certificate.title,
        issueDate: certificate.issue_date,
        cryptographicHash: certificate.cryptographic_hash,
        student: certificate.student_name,
        universityId: certificate.university_id,
        downloadUrl: certificate.pdf_url
      },
      verifiedAt: new Date().toISOString()
    });
    return true;
  }

  // =========================================================================
  // MODULE 19: MULTI-CAMPUS SAAS ARCHITECTURE
  // =========================================================================
  if (pathname === '/api/saas/tenants' && req.method === 'GET') {
    if (!req.user) { sendJson(401, { error: 'UNAUTHORIZED' }); return true; }
    const isPlatformOwner = req.user.role === 'PLATFORM_OWNER' && req.user.card_status === 'ACTIVE';
    const tenants = isPlatformOwner
      ? db.prepare(`
        SELECT t.id, t.name, t.slug, t.domain, t.subscription_plan, t.subscription_status,
          (SELECT COUNT(*) FROM campuses c WHERE c.tenant_id = t.id) AS campus_count
        FROM tenants t ORDER BY t.name
      `).all()
      : db.prepare(`
        SELECT id, name, slug, domain, subscription_plan, subscription_status
        FROM tenants WHERE id = ?
      `).all(req.user.tenant_id);
    const currentTenant = db.prepare(`
      SELECT id, name, slug, domain, logo_url, primary_color, secondary_color,
        subscription_plan, subscription_status
      FROM tenants WHERE id = ?
    `).get(tenantId);
    const campuses = db.prepare(`
      SELECT id, tenant_id, name, code, address, city FROM campuses WHERE tenant_id = ?
    `).all(tenantId);
    const policies = db.prepare('SELECT * FROM tenant_policies WHERE tenant_id = ?').get(tenantId);
    sendJson(200, { tenants, currentTenant, campuses, policies });
    return true;
  }

  // =========================================================================
  // MODULE 20: MOBILE & OFFLINE EXPERIENCE & GATE PASS PROTOCOL
  // =========================================================================
  if (pathname === '/api/mobile/emergency-override' && req.method === 'POST') {
    if (!hasRole('SECURITY_GUARD', 'UNIVERSITY_ADMIN')) {
      sendJson(req.user ? 403 : 401, { error: req.user ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      return true;
    }
    const { dualWitnessId, officerPin, reason, studentUniversityId } = body;
    const result = DynamicQRService.emergencyGateOverride({
      officerId: req.user.id,
      dualWitnessId,
      officerPin,
      reason,
      studentUniversityId,
      tenantId
    });
    sendJson(result.success ? 200 : 403, result);
    return true;
  }

  // =========================================================================
  // MODULE 21: ADVANCED ADMINISTRATIVE AUTOMATION
  // =========================================================================
  if (pathname === '/api/automation/workflows' && req.method === 'GET') {
    if (!hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN')) { sendJson(req.user ? 403 : 401, { error: req.user ? 'FORBIDDEN' : 'UNAUTHORIZED' }); return true; }
    const workflows = db.prepare('SELECT * FROM automation_workflows WHERE tenant_id = ?').all(tenantId);
    const generatedDocs = db.prepare(`
      SELECT gd.*, u.name as student_name, u.university_id
      FROM generated_documents gd
      JOIN users u ON gd.user_id = u.id
      WHERE gd.tenant_id = ?
      ORDER BY gd.created_at DESC LIMIT 10
    `).all(tenantId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ workflows, generatedDocs }));
    return true;
  }

  if (pathname === '/api/automation/generate-document' && req.method === 'POST') {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return true;
    }

    const allowedDocs = new Set(['BONAFIDE_CERTIFICATE', 'TRANSCRIPT', 'HALL_TICKET', 'NO_DUES_CLEARANCE']);
    const docType = typeof body.docType === 'string' ? body.docType : 'BONAFIDE_CERTIFICATE';
    if (!allowedDocs.has(docType)) { sendJson(400, { error: 'INVALID_DOCUMENT_TYPE' }); return true; }
    const doc = WorkflowEngine.generateDocument({
      tenantId,
      userId: req.user.id,
      docType: docType || 'BONAFIDE_CERTIFICATE'
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, document: doc }));
    return true;
  }

  // =========================================================================
  // MODULE 22: SECURITY & DATA GOVERNANCE
  // =========================================================================
  if (pathname === '/api/governance/audit-logs' && req.method === 'GET') {
    if (!hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN')) { sendJson(req.user ? 403 : 401, { error: req.user ? 'FORBIDDEN' : 'UNAUTHORIZED' }); return true; }
    const auditLogs = db.prepare(`
      SELECT al.*, u.name as user_name, u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.tenant_id = ?
      ORDER BY al.created_at DESC LIMIT 25
    `).all(tenantId);

    const sensitiveLogs = db.prepare(`
      SELECT sal.*, acc.name as accessed_by_name, tgt.name as target_student_name, tgt.university_id as target_university_id
      FROM sensitive_access_logs sal
      JOIN users acc ON sal.accessed_by_user_id = acc.id
      JOIN users tgt ON sal.target_student_id = tgt.id
      WHERE sal.tenant_id = ?
      ORDER BY sal.created_at DESC LIMIT 20
    `).all(tenantId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ auditLogs, sensitiveLogs }));
    return true;
  }

  return false;
}
