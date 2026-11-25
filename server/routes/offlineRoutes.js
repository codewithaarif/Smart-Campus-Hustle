import crypto from 'node:crypto';
import db from '../db/connection.js';
import { logAuditEvent } from '../middleware/audit.js';

const sendJson = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
};

export function handleOfflineRoutes(req, res, pathname, body) {
  if (pathname !== '/api/offline/sync' || req.method !== 'POST') return false;
  if (!req.user) {
    sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return true;
  }

  const tenantId = req.tenant.id;
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length < 1 || items.length > 50) {
    sendJson(res, 400, { error: 'INVALID_SYNC_BATCH', message: 'Send between 1 and 50 queued operations.' });
    return true;
  }

  const results = [];
  for (const item of items) {
    const clientItemId = typeof item?.id === 'string' ? item.id : '';
    const action = typeof item?.action === 'string' ? item.action : '';
    if (!clientItemId || clientItemId.length > 120 || !action || action.length > 100) {
      results.push({ id: clientItemId || null, status: 'REJECTED', error: 'INVALID_ITEM' });
      continue;
    }

    if (action !== 'OFFLINE_DRAFT_MAINTENANCE') {
      results.push({ id: clientItemId, status: 'REJECTED', error: 'UNSUPPORTED_ACTION' });
      continue;
    }

    if (!['STUDENT', 'FACULTY', 'UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'MAINTENANCE_STAFF'].includes(req.user.role)) {
      results.push({ id: clientItemId, status: 'REJECTED', error: 'ROLE_NOT_ALLOWED' });
      continue;
    }

    const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
      ? item.payload
      : {};
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const description = typeof payload.description === 'string'
      ? payload.description.trim()
      : 'Maintenance issue recorded offline; please review and add further details.';
    const location = typeof payload.location === 'string' && payload.location.trim()
      ? payload.location.trim()
      : 'Location to be confirmed';
    const category = typeof payload.category === 'string' ? payload.category : 'OTHER';

    if (title.length < 4 || title.length > 160 || description.length > 4000 ||
        location.length > 250 || !['ELECTRICAL', 'PLUMBING', 'HVAC', 'IT_HARDWARE', 'CARPENTRY', 'CIVIL', 'OTHER'].includes(category)) {
      results.push({ id: clientItemId, status: 'REJECTED', error: 'INVALID_MAINTENANCE_DRAFT' });
      continue;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare(`
        SELECT resource_id FROM offline_sync_records
        WHERE tenant_id = ? AND user_id = ? AND client_item_id = ?
      `).get(tenantId, req.user.id, clientItemId);
      if (existing) {
        db.exec('COMMIT');
        results.push({ id: clientItemId, status: 'DUPLICATE', resourceId: existing.resource_id });
        continue;
      }

      const departments = {
        ELECTRICAL: 'Electrical Maintenance',
        PLUMBING: 'Plumbing & Sanitation',
        HVAC: 'HVAC & Climate Team',
        IT_HARDWARE: 'Campus Network & Systems',
        CARPENTRY: 'Carpentry & Furniture',
        CIVIL: 'Civil & Masonry Services',
        OTHER: 'General Maintenance'
      };
      const ticketId = 'maint_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
      db.prepare(`
        INSERT INTO maintenance_tickets
          (id, tenant_id, campus_id, reported_by_user_id, title, description, category,
           location, priority, status, assigned_department)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NORMAL', 'OPEN', ?)
      `).run(ticketId, tenantId, req.user.campus_id, req.user.id, title,
        description, category, location, departments[category]);

      db.prepare(`
        INSERT INTO offline_sync_records (id, tenant_id, user_id, client_item_id, action, resource_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'offs_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14),
        tenantId, req.user.id, clientItemId, action, ticketId
      );
      db.exec('COMMIT');
      logAuditEvent(tenantId, req.user.id, 'OFFLINE_SYNC_MAINTENANCE', 'MAINTENANCE', ticketId,
        req.socket?.remoteAddress, { clientItemId });
      results.push({ id: clientItemId, status: 'SYNCED', resourceId: ticketId });
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      console.error('Offline sync item failed:', error);
      results.push({ id: clientItemId, status: 'RETRY', error: 'SERVER_ERROR' });
    }
  }

  sendJson(res, 200, {
    success: results.every((item) => item.status === 'SYNCED' || item.status === 'DUPLICATE'),
    results,
    remaining: results.filter((item) => !['SYNCED', 'DUPLICATE'].includes(item.status)).length
  });
  return true;
}
