import crypto from 'node:crypto';
import db from '../db/connection.js';
import { PaymentService } from '../services/paymentService.js';
import { logAuditEvent, logSensitiveAccess } from '../middleware/audit.js';

const sendJson = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

export function handleFinanceRoutes(req, res, pathname, body) {
  const tenantId = req.tenant?.id || 'tenant_apex';
  const userId = req.user?.id || null;

  if (pathname === '/api/finance/dues' && req.method === 'GET') {
    if (!req.user) return sendJson(res, 401, { error: 'UNAUTHORIZED' }) || true;
    const dues = db.prepare(`
      SELECT sfd.*, fs.fee_type, fs.due_date, fs.academic_year
      FROM student_fee_dues sfd
      JOIN fee_structures fs ON sfd.fee_structure_id = fs.id
      WHERE sfd.student_id = ? AND sfd.tenant_id = ?
    `).all(userId, tenantId);
    const transactions = db.prepare(`
      SELECT id, fee_due_id, razorpay_order_id, razorpay_payment_id, amount,
        currency, payment_mode, status, receipt_number, created_at
      FROM payment_transactions WHERE user_id = ? AND tenant_id = ?
      ORDER BY created_at DESC
    `).all(userId, tenantId);
    const scholarships = db.prepare(`
      SELECT s.*,
        (SELECT sa.status FROM scholarship_applications sa
         WHERE sa.scholarship_id = s.id AND sa.student_id = ?) AS application_status
      FROM scholarships s WHERE s.tenant_id = ?
    `).all(userId, tenantId);
    logSensitiveAccess(tenantId, userId, userId, 'FINANCIAL', 'Student viewing own fee ledger');
    sendJson(res, 200, { dues, transactions, scholarships, paymentConfig: PaymentService.getPublicConfig() });
    return true;
  }

  if (pathname === '/api/finance/razorpay/create-order' && req.method === 'POST') {
    if (!req.user) {
      sendJson(res, 401, { error: 'UNAUTHORIZED' });
      return true;
    }
    PaymentService.createOrder({
      tenantId,
      userId,
      feeDueId: body.feeDueId
    }).then((orderData) => {
      if (!res.writableEnded) sendJson(res, 200, { success: true, ...orderData });
    }).catch((error) => {
      if (!res.writableEnded) sendJson(res, 400, { error: 'ORDER_CREATION_FAILED', message: error.message });
    });
    return true;
  }

  if (pathname === '/api/finance/razorpay/verify-payment' && req.method === 'POST') {
    if (!req.user) {
      sendJson(res, 401, { error: 'UNAUTHORIZED' });
      return true;
    }
    PaymentService.verifyAndCompletePayment({
      tenantId,
      userId,
      orderId: body.orderId,
      paymentId: body.paymentId,
      signature: body.signature
    }).then((receipt) => {
      if (res.writableEnded) return;
      logAuditEvent(tenantId, userId, 'PAYMENT_COMPLETE', 'FINANCE', body.orderId,
        req.socket?.remoteAddress, { amount: receipt.amount, receiptNumber: receipt.receiptNumber });
      sendJson(res, 200, receipt);
    }).catch((error) => {
      if (!res.writableEnded) {
        sendJson(res, 400, { error: 'PAYMENT_FAILED', message: error.message });
      }
    });
    return true;
  }

  if (pathname === '/api/finance/scholarships/apply' && req.method === 'POST') {
    if (!req.user) {
      sendJson(res, 401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const scholarshipId = typeof body.scholarshipId === 'string' ? body.scholarshipId : '';
    const gpa = Number(body.gpa);
    const annualIncome = Number(body.annualIncome);
    const statementOfPurpose = typeof body.statementOfPurpose === 'string' ? body.statementOfPurpose.trim() : '';
    if (!scholarshipId || !Number.isFinite(gpa) || gpa < 0 || gpa > 10 ||
        !Number.isFinite(annualIncome) || annualIncome < 0 || !statementOfPurpose || statementOfPurpose.length > 5000) {
      sendJson(res, 400, { error: 'INVALID_APPLICATION', message: 'Provide valid GPA, income, scholarship, and statement of purpose.' });
      return true;
    }
    const scholarship = db.prepare(`
      SELECT id FROM scholarships
      WHERE id = ? AND tenant_id = ? AND date(application_deadline) >= date('now')
    `).get(scholarshipId, tenantId);
    if (!scholarship) {
      sendJson(res, 404, { error: 'SCHOLARSHIP_UNAVAILABLE', message: 'Scholarship not found or application deadline has passed.' });
      return true;
    }
    const alreadyApplied = db.prepare(`
      SELECT id FROM scholarship_applications WHERE scholarship_id = ? AND student_id = ? AND tenant_id = ?
    `).get(scholarshipId, userId, tenantId);
    if (alreadyApplied) {
      sendJson(res, 409, { error: 'ALREADY_APPLIED', message: 'An application already exists for this scholarship.' });
      return true;
    }
    const appId = 'sapp_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    db.prepare(`
      INSERT INTO scholarship_applications
        (id, tenant_id, scholarship_id, student_id, gpa, annual_income, statement_of_purpose, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')
    `).run(appId, tenantId, scholarshipId, userId, gpa, annualIncome, statementOfPurpose);
    sendJson(res, 201, { success: true, applicationId: appId });
    return true;
  }
  return false;
}
