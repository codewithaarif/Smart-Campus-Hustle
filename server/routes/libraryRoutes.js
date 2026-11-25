import crypto from 'node:crypto';
import db from '../db/connection.js';

export function handleLibraryRoutes(req, res, pathname, body) {
  const tenantId = (req.tenant && req.tenant.id) || 'tenant_apex';
  const userId = req.user ? req.user.id : null;

  // GET /api/library/books
  if (pathname === '/api/library/books' && req.method === 'GET') {
    const books = db.prepare('SELECT * FROM library_books WHERE tenant_id = ? ORDER BY title ASC').all(tenantId);
    
    let userIssues = [];
    let userReservations = [];
    if (userId) {
      userIssues = db.prepare(`
        SELECT bi.*, b.title, b.author, b.isbn
        FROM book_issues bi
        JOIN library_books b ON bi.book_id = b.id
        WHERE bi.user_id = ? AND bi.tenant_id = ?
        ORDER BY bi.issue_date DESC
      `).all(userId, tenantId);

      userReservations = db.prepare(`
        SELECT br.*, b.title, b.author
        FROM book_reservations br
        JOIN library_books b ON br.book_id = b.id
        WHERE br.user_id = ? AND br.tenant_id = ?
      `).all(userId, tenantId);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ books, userIssues, userReservations }));
    return true;
  }

  // POST /api/library/reserve
  if (pathname === '/api/library/reserve' && req.method === 'POST') {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return true;
    }
    const bookId = typeof body.bookId === 'string' ? body.bookId : '';
    if (!bookId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID_BOOK_ID' }));
      return true;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const book = db.prepare('SELECT id, title FROM library_books WHERE id = ? AND tenant_id = ?')
        .get(bookId, tenantId);
      if (!book) {
        db.exec('ROLLBACK');
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'BOOK_NOT_FOUND' }));
        return true;
      }
      const existing = db.prepare(`
        SELECT id, queue_number, status FROM book_reservations
        WHERE book_id = ? AND tenant_id = ? AND user_id = ?
          AND status IN ('WAITING', 'ALLOTTED')
      `).get(bookId, tenantId, req.user.id);
      if (existing) {
        db.exec('COMMIT');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          alreadyReserved: true,
          reservationId: existing.id,
          queueNumber: existing.queue_number,
          status: existing.status
        }));
        return true;
      }

      const queueNumber = db.prepare(`
        SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_queue
        FROM book_reservations
        WHERE book_id = ? AND tenant_id = ? AND status = 'WAITING'
      `).get(bookId, tenantId).next_queue;
      const reservationId = 'res_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
      db.prepare(`
        INSERT INTO book_reservations (id, tenant_id, book_id, user_id, status, queue_number)
        VALUES (?, ?, ?, ?, 'WAITING', ?)
      `).run(reservationId, tenantId, bookId, req.user.id, queueNumber);
      db.exec('COMMIT');

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, reservationId, queueNumber, status: 'WAITING' }));
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      console.error('Library reservation failed:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'RESERVATION_FAILED' }));
    }
    return true;
  }

  // POST /api/library/turnstile-entry
  if (pathname === '/api/library/turnstile-entry' && req.method === 'POST') {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return true;
    }

    const entryId = 'lib_entry_' + crypto.randomUUID().slice(0, 8);
    const allocatedSeat = 'Carrel #' + crypto.randomInt(10, 85);

    db.prepare(`
      INSERT INTO library_gate_logs (id, tenant_id, user_id, allocated_seat)
      VALUES (?, ?, ?, ?)
    `).run(entryId, tenantId, req.user.id, allocatedSeat);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      verified: true,
      allocatedSeat,
      message: `Library entry recorded for ${req.user.name}. Suggested study area: ${allocatedSeat}. Physical turnstile hardware is not connected.`
    }));
    return true;
  }

  return false;
}
