import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert';
import db from '../server/db/connection.js';
import { seedDatabase } from '../server/db/seed.js';
import { handleOfflineRoutes } from '../server/routes/offlineRoutes.js';

seedDatabase();

function callSync(items) {
  let status = 0;
  let body = '';
  const req = {
    method: 'POST',
    url: '/api/offline/sync',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    tenant: { id: 'tenant_apex' },
    user: {
      id: 'user_student_1',
      tenant_id: 'tenant_apex',
      campus_id: 'campus_apex_main',
      role: 'STUDENT'
    }
  };
  const res = {
    writeHead(value) { status = value; },
    end(value) { body = value; }
  };
  assert.strictEqual(handleOfflineRoutes(req, res, '/api/offline/sync', { items }), true);
  return { status, body: JSON.parse(body) };
}

test('Offline maintenance draft sync is idempotent and only acknowledged work is accepted', () => {
  const clientId = 'test-offline-' + crypto.randomUUID();
  const item = {
    id: clientId,
    action: 'OFFLINE_DRAFT_MAINTENANCE',
    payload: {
      title: 'Offline test maintenance issue',
      description: 'A test issue synchronized from an offline device.',
      category: 'OTHER',
      location: 'Test Building'
    }
  };
  try {
    const first = callSync([item]);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.body.results[0].status, 'SYNCED');
    const ticketId = first.body.results[0].resourceId;
    assert.ok(db.prepare('SELECT id FROM maintenance_tickets WHERE id = ?').get(ticketId));

    const second = callSync([item]);
    assert.strictEqual(second.body.results[0].status, 'DUPLICATE');
    assert.strictEqual(second.body.results[0].resourceId, ticketId);

    const unsupported = callSync([{ id: clientId + '-unknown', action: 'UNIMPLEMENTED_ACTION', payload: {} }]);
    assert.strictEqual(unsupported.body.results[0].status, 'REJECTED');
    assert.strictEqual(unsupported.body.results[0].error, 'UNSUPPORTED_ACTION');
  } finally {
    db.prepare('DELETE FROM offline_sync_records WHERE client_item_id LIKE ?').run(clientId + '%');
    db.prepare('DELETE FROM maintenance_tickets WHERE title = ?').run('Offline test maintenance issue');
  }
});
