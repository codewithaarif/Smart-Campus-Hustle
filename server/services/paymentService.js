import crypto from 'node:crypto';
import db from '../db/connection.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const MOCK_MODE = !IS_PRODUCTION && process.env.PAYMENTS_MODE !== 'razorpay';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

function safeHexEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' ||
      !/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export class PaymentService {
  static getPublicConfig() {
    const ready = MOCK_MODE || Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
    return {
      mode: MOCK_MODE ? 'LOCAL_MOCK' : 'RAZORPAY',
      ready,
      description: MOCK_MODE ? 'Local development simulation' : (ready ? 'Razorpay checkout configured' : 'Razorpay credentials missing')
    };
  }

  static async createOrder({ tenantId, userId, feeDueId, currency = 'INR' }) {
    if (!tenantId || !userId || !feeDueId) {
      throw new Error('A valid tenant, authenticated user, and fee due are required.');
    }
    if (currency !== 'INR') throw new Error('Only INR payments are currently supported.');

    // Never accept the amount from the browser. The open balance is authoritative.
    const due = db.prepare(`
      SELECT id, tenant_id, student_id, total_amount, amount_paid, balance_amount, status
      FROM student_fee_dues
      WHERE id = ? AND tenant_id = ? AND student_id = ?
    `).get(feeDueId, tenantId, userId);
    if (!due) throw new Error('Fee due was not found for the authenticated student.');
    const amount = Number(due.balance_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('There is no outstanding balance for this fee.');
    }
    // Expire abandoned mock/provider orders and reuse a still-live pending order.
    db.prepare(`UPDATE payment_transactions SET status = 'FAILED' WHERE fee_due_id = ? AND tenant_id = ? AND user_id = ? AND status = 'PENDING' AND created_at <= datetime('now', '-15 minutes')`).run(feeDueId, tenantId, userId);
    const pendingOrder = db.prepare(`SELECT * FROM payment_transactions WHERE fee_due_id = ? AND tenant_id = ? AND user_id = ? AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1`).get(feeDueId, tenantId, userId);
    if (pendingOrder) {
      return {
        orderId: pendingOrder.razorpay_order_id,
        amount: pendingOrder.amount,
        amountPaise: Math.round(Number(pendingOrder.amount) * 100),
        currency: pendingOrder.currency,
        keyId: MOCK_MODE ? null : RAZORPAY_KEY_ID,
        transactionId: pendingOrder.id,
        receiptNumber: pendingOrder.receipt_number,
        mockMode: MOCK_MODE
      };
    }
    const amountPaise = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new Error('Fee amount is invalid.');
    }

    const receiptNumber = 'RCP-' + Date.now().toString().slice(-6) + '-' + crypto.randomInt(100, 999);
    const txnId = 'txn_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    let orderId;

    if (MOCK_MODE) {
      orderId = 'order_mock_' + crypto.randomBytes(12).toString('hex');
    } else {
      if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
        throw new Error('Razorpay credentials are not configured.');
      }
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency,
          receipt: receiptNumber,
          notes: { tenant_id: tenantId, user_id: userId, fee_due_id: feeDueId }
        }),
        signal: AbortSignal.timeout(15_000)
      });
      const order = await response.json().catch(() => ({}));
      if (!response.ok || typeof order.id !== 'string') {
        throw new Error('Razorpay could not create the payment order.');
      }
      orderId = order.id;
    }

    db.prepare(`
      INSERT INTO payment_transactions
        (id, tenant_id, user_id, fee_due_id, razorpay_order_id, amount, currency, payment_mode, status, receipt_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).run(
      txnId, tenantId, userId, feeDueId, orderId, amount, currency,
      MOCK_MODE ? 'MOCK' : 'RAZORPAY', receiptNumber
    );

    return {
      orderId,
      amount,
      amountPaise,
      currency,
      keyId: MOCK_MODE ? null : RAZORPAY_KEY_ID,
      transactionId: txnId,
      receiptNumber,
      mockMode: MOCK_MODE
    };
  }

  static async verifyAndCompletePayment({ tenantId, userId, orderId, paymentId, signature }) {
    if (typeof orderId !== 'string' || !orderId || typeof paymentId !== 'string' || !paymentId ||
        typeof signature !== 'string' || !signature) {
      throw new Error('Order, payment ID, and payment signature are required.');
    }

    const txn = db.prepare(`
      SELECT * FROM payment_transactions
      WHERE razorpay_order_id = ? AND tenant_id = ? AND user_id = ?
    `).get(orderId, tenantId, userId);
    if (!txn) throw new Error('Order transaction not found for this account.');
    if (txn.status === 'SUCCESS') {
      if (txn.razorpay_payment_id === paymentId) {
        return {
          success: true, idempotent: true, receiptNumber: txn.receipt_number,
          paymentMode: txn.payment_mode, paymentId, orderId, amount: txn.amount, paidAt: txn.created_at,
          digitalReceiptPdfHash: crypto.createHash('sha256')
            .update(`${txn.receipt_number}:${txn.amount}`).digest('hex')
        };
      }
      throw new Error('This order has already been completed.');
    }
    if (txn.status !== 'PENDING') throw new Error('This payment order is not pending.');

    if (MOCK_MODE) {
      if (signature !== 'MOCK_APPROVED') throw new Error('Mock payment approval token is invalid.');
    } else {
      const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`).digest('hex');
      if (!safeHexEqual(expected, signature)) {
        throw new Error('Payment verification failed: invalid gateway signature.');
      }

      // A valid HMAC binds payment ID to order ID, but the provider remains
      // authoritative for capture status, currency, and amount.
      const providerResponse = await fetch(
        'https://api.razorpay.com/v1/payments/' + encodeURIComponent(paymentId),
        {
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')
          },
          signal: AbortSignal.timeout(15_000)
        }
      );
      const providerPayment = await providerResponse.json().catch(() => ({}));
      if (!providerResponse.ok || providerPayment.id !== paymentId ||
          providerPayment.order_id !== orderId || providerPayment.status !== 'captured' ||
          providerPayment.currency !== txn.currency ||
          Number(providerPayment.amount) !== Math.round(Number(txn.amount) * 100)) {
        throw new Error('Razorpay has not confirmed a captured payment matching this order and amount.');
      }
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const due = txn.fee_due_id
        ? db.prepare(`
          SELECT * FROM student_fee_dues
          WHERE id = ? AND tenant_id = ? AND student_id = ?
        `).get(txn.fee_due_id, tenantId, userId)
        : null;
      if (txn.fee_due_id && !due) throw new Error('Linked fee due is not owned by this account.');
      if (due && Number(due.balance_amount) + 0.0001 < Number(txn.amount)) {
        throw new Error('The outstanding fee balance changed after this order was created.');
      }
      const changed = db.prepare(`
        UPDATE payment_transactions
        SET status = 'SUCCESS', razorpay_payment_id = ?, razorpay_signature = ?
        WHERE id = ? AND tenant_id = ? AND user_id = ? AND status = 'PENDING'
      `).run(paymentId, signature, txn.id, tenantId, userId);
      if (changed.changes !== 1) throw new Error('Payment was already processed; refresh the fee ledger.');

      if (due) {
        const newPaid = Number((Number(due.amount_paid) + Number(txn.amount)).toFixed(2));
        const newBalance = Math.max(0, Number((Number(due.total_amount) - newPaid).toFixed(2)));
        const status = newBalance === 0 ? 'PAID' : 'PARTIAL';
        db.prepare(`
          UPDATE student_fee_dues
          SET amount_paid = ?, balance_amount = ?, status = ?
          WHERE id = ? AND tenant_id = ? AND student_id = ?
        `).run(newPaid, newBalance, status, due.id, tenantId, userId);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return {
      success: true,
      receiptNumber: txn.receipt_number,
      paymentMode: txn.payment_mode,
      paymentId,
      orderId,
      amount: txn.amount,
      paidAt: new Date().toISOString(),
      digitalReceiptPdfHash: crypto.createHash('sha256')
        .update(`${txn.receipt_number}:${txn.amount}`).digest('hex')
    };
  }
}
