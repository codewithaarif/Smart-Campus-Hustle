import crypto from 'node:crypto';
import db from '../db/connection.js';
import { logAuditEvent } from '../middleware/audit.js';
import { WorkflowEngine } from '../services/workflowEngine.js';

export function handleOperationsRoutes(req, res, pathname, body) {
  const tenantId = (req.tenant && req.tenant.id) || 'tenant_apex';
  const userId = req.user ? req.user.id : null;
  const sendJson = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };
  const hasRole = (...roles) => !!req.user && roles.includes(req.user.role);

  if (pathname === '/api/notifications' && req.method === 'GET') {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return true;
    }

    const notifications = db.prepare(`
      SELECT id, title, message, type, source_id, read_at, created_at
      FROM user_notifications
      WHERE tenant_id = ? AND recipient_user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(tenantId, userId);
    const unreadCount = notifications.filter((notification) => !notification.read_at).length;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ notifications, unreadCount }));
    return true;
  }

  if (pathname === '/api/notifications/read' && req.method === 'POST') {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return true;
    }

    db.prepare(`
      UPDATE user_notifications
      SET read_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND recipient_user_id = ? AND read_at IS NULL
    `).run(tenantId, userId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  // =========================================================================
  // MODULE 3: VISITOR MANAGEMENT
  // =========================================================================
  // =========================================================================
  // MODULE 3: VISITOR MANAGEMENT
  // =========================================================================
  if (pathname === '/api/visitors' && req.method === 'GET') {
    if (!hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'SECURITY_GUARD', 'FACULTY', 'STUDENT')) {
      sendJson(req.user ? 403 : 401, { error: req.user ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      return true;
    }
    const staff = hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'SECURITY_GUARD');
    const visitors = db.prepare(`
      SELECT v.id, v.tenant_id, v.campus_id, v.visitor_name, v.visitor_phone,
        v.visitor_email, v.id_proof_type, v.id_proof_number, v.host_user_id,
        v.purpose, v.expected_arrival, v.host_approval_status, v.pass_qr_code,
        v.allowed_zones, v.check_in_time, v.check_out_time, v.created_at,
        u.name AS host_name, u.department AS host_department
      FROM visitor_requests v
      JOIN users u ON v.host_user_id = u.id
      WHERE v.tenant_id = ? AND (? = 1 OR v.host_user_id = ?)
      ORDER BY v.expected_arrival DESC
    `).all(tenantId, staff ? 1 : 0, userId);
    sendJson(200, { visitors });
    return true;
  }

  if (pathname === '/api/visitors/register' && req.method === 'POST') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const { visitorName, visitorPhone, visitorEmail, idProofType, idProofNumber, purpose, expectedArrival } = body;
    const allowedProofTypes = new Set(['AADHAAR', 'PASSPORT', 'DRIVERS_LICENSE', 'OTHER']);
    const arrival = typeof expectedArrival === 'string' ? new Date(expectedArrival) : new Date(NaN);
    if (typeof visitorName !== 'string' || visitorName.trim().length < 2 || visitorName.length > 120 ||
        typeof visitorPhone !== 'string' || visitorPhone.trim().length < 7 || visitorPhone.length > 25 ||
        typeof idProofType !== 'string' || !allowedProofTypes.has(idProofType) ||
        typeof idProofNumber !== 'string' || idProofNumber.trim().length < 4 || idProofNumber.length > 100 ||
        typeof purpose !== 'string' || purpose.trim().length < 5 || purpose.length > 500 ||
        !Number.isFinite(arrival.getTime()) || arrival.getTime() < Date.now() - 60 * 60 * 1000) {
      sendJson(400, { error: 'INVALID_VISITOR_REQUEST', message: 'Provide valid visitor details and an arrival time.' });
      return true;
    }
    const hostUserId = hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN') && typeof body.hostUserId === 'string'
      ? body.hostUserId
      : req.user.id;
    const host = db.prepare('SELECT id, campus_id FROM users WHERE id = ? AND tenant_id = ?')
      .get(hostUserId, tenantId);
    if (!host) {
      sendJson(404, { error: 'HOST_NOT_FOUND' });
      return true;
    }
    const suffix = idProofNumber.replace(/\s/g, '').slice(-4);
    const maskedProof = '••••' + suffix;
    const reqId = 'vis_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    db.prepare(`
      INSERT INTO visitor_requests
        (id, tenant_id, campus_id, visitor_name, visitor_phone, visitor_email, id_proof_type,
         id_proof_number, host_user_id, purpose, expected_arrival, host_approval_status, pass_qr_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL)
    `).run(
      reqId, tenantId, host.campus_id || req.user.campus_id, visitorName.trim(),
      visitorPhone.trim(), typeof visitorEmail === 'string' ? visitorEmail.trim().slice(0, 254) : '',
      idProofType, maskedProof, hostUserId, purpose.trim(), arrival.toISOString().replace('T', ' ').slice(0, 19)
    );
    logAuditEvent(tenantId, req.user.id, 'VISITOR_REGISTER', 'VISITOR', reqId,
      req.socket?.remoteAddress, { hostUserId, idProofType });
    sendJson(201, { success: true, visitorId: reqId, approvalRequired: true, passQrCode: null });
    return true;
  }

  if (pathname === '/api/visitors/approval' && req.method === 'POST') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const { visitorId, decision } = body;
    if (typeof visitorId !== 'string' || !['APPROVED', 'REJECTED'].includes(decision)) {
      sendJson(400, { error: 'INVALID_APPROVAL' });
      return true;
    }
    const visitor = db.prepare('SELECT * FROM visitor_requests WHERE id = ? AND tenant_id = ?')
      .get(visitorId, tenantId);
    if (!visitor) {
      sendJson(404, { error: 'VISITOR_NOT_FOUND' });
      return true;
    }
    if (visitor.host_user_id !== req.user.id && !hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN')) {
      sendJson(403, { error: 'FORBIDDEN' });
      return true;
    }
    if (visitor.host_approval_status !== 'PENDING') {
      sendJson(409, { error: 'ALREADY_REVIEWED' });
      return true;
    }
    const passQr = decision === 'APPROVED'
      ? 'PASS_VIS_' + visitor.id + '_' + crypto.randomBytes(16).toString('hex')
      : null;
    db.prepare(`
      UPDATE visitor_requests
      SET host_approval_status = ?, pass_qr_code = ?
      WHERE id = ? AND tenant_id = ? AND host_approval_status = 'PENDING'
    `).run(decision, passQr, visitorId, tenantId);
    logAuditEvent(tenantId, req.user.id, 'VISITOR_APPROVAL', 'VISITOR', visitorId,
      req.socket?.remoteAddress, { decision });
    sendJson(200, { success: true, decision, passQrCode: passQr });
    return true;
  }

  if (pathname === '/api/visitors/verify-gate' && req.method === 'POST') {
    if (!hasRole('SECURITY_GUARD', 'UNIVERSITY_ADMIN', 'CAMPUS_ADMIN')) {
      sendJson(req.user ? 403 : 401, { error: req.user ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      return true;
    }
    const { passQrCode, gateNumber = 'Main Gate' } = body;
    if (typeof passQrCode !== 'string' || passQrCode.length > 300) {
      sendJson(400, { valid: false, error: 'INVALID_PASS' });
      return true;
    }
    const pass = db.prepare('SELECT * FROM visitor_requests WHERE pass_qr_code = ? AND tenant_id = ?')
      .get(passQrCode, tenantId);
    if (!pass) {
      sendJson(404, { valid: false, message: 'Invalid or unregistered visitor pass.' });
      return true;
    }
    if (pass.host_approval_status !== 'APPROVED') {
      sendJson(403, { valid: false, message: 'Visitor pass has not been approved.' });
      return true;
    }
    const arrival = new Date(pass.expected_arrival.replace(' ', 'T')).getTime();
    if (!Number.isFinite(arrival) || Date.now() < arrival - 30 * 60 * 1000 || Date.now() > arrival + 4 * 60 * 60 * 1000) {
      sendJson(403, { valid: false, message: 'Visitor pass is outside its permitted arrival window.' });
      return true;
    }
    let action;
    if (!pass.check_in_time) {
      const updated = db.prepare(`
        UPDATE visitor_requests SET check_in_time = CURRENT_TIMESTAMP, security_officer_id = ?
        WHERE id = ? AND tenant_id = ? AND check_in_time IS NULL
      `).run(req.user.id, pass.id, tenantId);
      if (updated.changes !== 1) {
        sendJson(409, { valid: false, message: 'Visitor state changed; scan again.' });
        return true;
      }
      action = 'CHECKED_IN';
    } else if (!pass.check_out_time) {
      const updated = db.prepare(`
        UPDATE visitor_requests SET check_out_time = CURRENT_TIMESTAMP, security_officer_id = ?
        WHERE id = ? AND tenant_id = ? AND check_out_time IS NULL
      `).run(req.user.id, pass.id, tenantId);
      if (updated.changes !== 1) {
        sendJson(409, { valid: false, message: 'Visitor state changed; scan again.' });
        return true;
      }
      action = 'CHECKED_OUT';
    } else {
      sendJson(409, { valid: false, message: 'Visitor pass has already been checked out.' });
      return true;
    }
    logAuditEvent(tenantId, req.user.id, 'VISITOR_' + action, 'VISITOR', pass.id,
      req.socket?.remoteAddress, { gateNumber });
    sendJson(200, { valid: true, action, visitorId: pass.id, gateNumber, timestamp: new Date().toISOString() });
    return true;
  }

  // MODULE 4: EMERGENCY & SAFETY MANAGEMENT
  // =========================================================================
  if (pathname === '/api/emergency/sos' && req.method === 'POST') {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return true;
    }

    const { alertType = 'GENERAL_SOS', locationDescription, gpsCoordinates = null } = body;
    const allowedAlertTypes = new Set(['GENERAL_SOS', 'MEDICAL', 'HARASSMENT', 'FIRE']);
    if (!allowedAlertTypes.has(alertType) || typeof locationDescription !== 'string' ||
        locationDescription.trim().length < 2 || locationDescription.length > 250 ||
        (gpsCoordinates !== null && (typeof gpsCoordinates !== 'string' || !/^-?\d{1,2}\.\d+,-?\d{1,3}\.\d+$/.test(gpsCoordinates)))) {
      sendJson(400, { error: 'INVALID_SOS_REQUEST', message: 'Provide a valid emergency type, location, and optional GPS coordinates.' });
      return true;
    }
    const sosId = 'sos_' + crypto.randomUUID().slice(0, 8);

    db.prepare(`
      INSERT INTO sos_alerts (id, tenant_id, campus_id, triggered_by_user_id, alert_type, location_description, gps_coordinates, status, dispatched_officers)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NULL)
    `).run(sosId, tenantId, req.user.campus_id || 'campus_apex_main', req.user.id, alertType, locationDescription, gpsCoordinates);

    const student = req.user.role === 'STUDENT'
      ? db.prepare(`
        SELECT id, name, university_id, parent_id, campus_id
        FROM users WHERE id = ? AND tenant_id = ?
      `).get(req.user.id, tenantId)
      : db.prepare(`
        SELECT id, name, university_id, parent_id, campus_id
        FROM users
        WHERE parent_id = ? AND tenant_id = ? AND role = 'STUDENT'
        ORDER BY created_at DESC
        LIMIT 1
      `).get(req.user.id, tenantId);
    const studentName = student?.name || req.user.name;
    const studentId = student?.university_id || req.user.university_id || 'Unknown';
    const recipients = student
      ? db.prepare(`
        SELECT id, role
        FROM users
        WHERE tenant_id = ?
          AND (
            (id = ? AND role = 'PARENT')
            OR (
              role IN ('WARDEN', 'COUNSELLOR')
              AND (campus_id = ? OR campus_id IS NULL)
            )
          )
      `).all(tenantId, student.parent_id || '', student.campus_id || req.user.campus_id)
      : [];
    const notificationMessage =
      `Emergency alert from ${studentName} (${studentId}): ${alertType.replaceAll('_', ' ')} at ${locationDescription}. ` +
      'This is an in-app alert; contact emergency services directly if immediate response is needed.';
    const insertNotification = db.prepare(`
      INSERT INTO user_notifications (
        id, tenant_id, recipient_user_id, title, message, type, source_id
      ) VALUES (?, ?, ?, ?, ?, 'EMERGENCY', ?)
    `);
    for (const recipient of recipients) {
      insertNotification.run(
        `notif_${crypto.randomUUID()}`,
        tenantId,
        recipient.id,
        `Campus SOS: ${studentName}`,
        notificationMessage,
        sosId
      );
    }

    logAuditEvent(tenantId, req.user.id, 'SOS_TRIGGER', 'SAFETY', sosId, req.socket.remoteAddress, { alertType, gpsCoordinates });
    WorkflowEngine.trigger(tenantId, 'SOS_FIRED', { sosId, student_name: studentName, studentName, locationDescription });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      sosId,
      notifiedRoles: [...new Set(recipients.map((recipient) => recipient.role))],
      status: 'RECORDED',
      etaMinutes: null,
      instructions: 'Your alert was recorded in the campus portal. This demo is not connected to a live emergency response team. For immediate help, call 112.'
    }));
    return true;
  }

  if (pathname === '/api/emergency/incidents' && req.method === 'POST') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const { incidentType, location, description } = body;
    const allowedTypes = new Set(['THEFT', 'TRESPASSING', 'FIGHT', 'CYBER', 'MEDICAL', 'FIRE', 'HARASSMENT', 'OTHER']);
    if (!allowedTypes.has(incidentType) || typeof location !== 'string' ||
        location.trim().length < 2 || location.length > 250 ||
        typeof description !== 'string' || description.trim().length < 8 || description.length > 4000) {
      sendJson(400, { error: 'INVALID_INCIDENT', message: 'Provide a valid incident type, location, and description.' });
      return true;
    }
    const incidentId = 'inc_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    db.prepare(`
      INSERT INTO security_incidents
        (id, tenant_id, campus_id, reported_by, incident_type, location, description, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'REPORTED')
    `).run(incidentId, tenantId, req.user.campus_id, req.user.id,
      incidentType, location.trim(), description.trim());
    logAuditEvent(tenantId, req.user.id, 'INCIDENT_REPORTED', 'SAFETY', incidentId,
      req.socket?.remoteAddress, { incidentType });
    sendJson(201, { success: true, incidentId, status: 'REPORTED' });
    return true;
  }

  if (pathname === '/api/emergency/incidents' && req.method === 'GET') {
    if (!hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'SECURITY_GUARD', 'WARDEN')) {
      sendJson(req.user ? 403 : 401, { error: req.user ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      return true;
    }
    const incidents = db.prepare(`
      SELECT si.*, u.name AS reporter_name
      FROM security_incidents si
      LEFT JOIN users u ON u.id = si.reported_by
      WHERE si.tenant_id = ?
      ORDER BY si.created_at DESC LIMIT 100
    `).all(tenantId);
    sendJson(200, { incidents });
    return true;
  }

  if (pathname === '/api/emergency/contacts' && req.method === 'GET') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const contacts = db.prepare('SELECT id, tenant_id, campus_id, service_name, phone_number, email, operating_hours FROM emergency_contacts WHERE tenant_id = ?').all(tenantId);
    const broadcasts = db.prepare('SELECT id, title, message, severity, sent_by, channels, created_at FROM emergency_broadcasts WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5').all(tenantId);
    const staffAccess = hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'SECURITY_GUARD', 'WARDEN');
    const recentSos = db.prepare(`
      SELECT s.id, s.alert_type, s.location_description, s.status, s.created_at,
        u.name AS user_name, u.phone AS user_phone, u.role AS user_role
      FROM sos_alerts s
      JOIN users u ON s.triggered_by_user_id = u.id
      WHERE s.tenant_id = ? AND (? = 1 OR s.triggered_by_user_id = ?)
      ORDER BY s.created_at DESC LIMIT 10
    `).all(tenantId, staffAccess ? 1 : 0, userId);
    sendJson(200, { contacts, broadcasts, recentSos });
    return true;
  }

  // =========================================================================
  // MODULE 5: MAINTENANCE MANAGEMENT
  // =========================================================================
  if (pathname === '/api/maintenance/tickets' && req.method === 'GET') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const staff = hasRole('MAINTENANCE_STAFF', 'UNIVERSITY_ADMIN', 'CAMPUS_ADMIN');
    const tickets = db.prepare(`
      SELECT m.*, u.name AS reporter_name, tech.name AS technician_name
      FROM maintenance_tickets m
      JOIN users u ON m.reported_by_user_id = u.id
      LEFT JOIN users tech ON m.assigned_technician_id = tech.id
      WHERE m.tenant_id = ? AND (? = 1 OR m.reported_by_user_id = ?)
      ORDER BY CASE m.status WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'RESOLVED' THEN 3 ELSE 4 END,
        m.created_at DESC
    `).all(tenantId, staff ? 1 : 0, userId);
    sendJson(200, { tickets });
    return true;
  }

  if (pathname === '/api/maintenance/tickets' && req.method === 'POST') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const { title, description, category, location, photoUrl, priority = 'NORMAL' } = body;
    const allowedCategories = new Set(['ELECTRICAL', 'PLUMBING', 'HVAC', 'IT_HARDWARE', 'CARPENTRY', 'CIVIL']);
    const allowedPriorities = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
    if (typeof title !== 'string' || title.trim().length < 4 || title.length > 160 ||
        typeof description !== 'string' || description.trim().length < 8 || description.length > 4000 ||
        typeof category !== 'string' || !allowedCategories.has(category) ||
        typeof location !== 'string' || location.trim().length < 2 || location.length > 250 ||
        !allowedPriorities.has(priority)) {
      sendJson(400, { error: 'INVALID_TICKET', message: 'Provide a title, description, category, location, and valid priority.' });
      return true;
    }
    const deptMap = {
      ELECTRICAL: 'Electrical Maintenance', PLUMBING: 'Plumbing & Sanitation',
      HVAC: 'HVAC & Climate Team', IT_HARDWARE: 'Campus Network & Systems',
      CARPENTRY: 'Carpentry & Furniture', CIVIL: 'Civil & Masonry Services'
    };
    const assignedDepartment = deptMap[category];
    const ticketId = 'maint_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    db.prepare(`
      INSERT INTO maintenance_tickets
        (id, tenant_id, campus_id, reported_by_user_id, title, description, category,
         location, photo_url, priority, status, assigned_department)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `).run(ticketId, tenantId, req.user.campus_id, req.user.id,
      title.trim(), description.trim(), category, location.trim(),
      typeof photoUrl === 'string' ? photoUrl.slice(0, 1000) : null, priority, assignedDepartment);
    sendJson(201, { success: true, ticketId, assignedDepartment });
    return true;
  }

  if (pathname === '/api/maintenance/resolve' && req.method === 'POST') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const { ticketId, resolutionNotes, studentRating, studentFeedback } = body;
    if (typeof ticketId !== 'string') {
      sendJson(400, { error: 'INVALID_TICKET_ID' });
      return true;
    }
    if (studentRating !== undefined) {
      if (!Number.isInteger(studentRating) || studentRating < 1 || studentRating > 5) {
        sendJson(400, { error: 'INVALID_RATING' });
        return true;
      }
      const updated = db.prepare(`
        UPDATE maintenance_tickets SET student_rating = ?, student_feedback = ?
        WHERE id = ? AND tenant_id = ? AND reported_by_user_id = ? AND status = 'RESOLVED'
      `).run(studentRating, String(studentFeedback || '').slice(0, 1000), ticketId, tenantId, userId);
      if (updated.changes !== 1) {
        sendJson(404, { error: 'TICKET_NOT_FOUND_OR_NOT_RESOLVED' });
        return true;
      }
    } else {
      if (!hasRole('MAINTENANCE_STAFF', 'UNIVERSITY_ADMIN', 'CAMPUS_ADMIN')) {
        sendJson(403, { error: 'FORBIDDEN' });
        return true;
      }
      const updated = db.prepare(`
        UPDATE maintenance_tickets SET status = 'RESOLVED', resolution_notes = ?, resolved_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
      `).run(String(resolutionNotes || 'Resolved by maintenance team.').slice(0, 2000), ticketId, tenantId);
      if (updated.changes !== 1) {
        sendJson(404, { error: 'TICKET_NOT_FOUND_OR_ALREADY_RESOLVED' });
        return true;
      }
    }
    sendJson(200, { success: true });
    return true;
  }

  // MODULE 8: SMART TRANSPORT
  // =========================================================================
  if (pathname === '/api/transport/routes' && req.method === 'GET') {
    const routes = db.prepare('SELECT * FROM transport_routes WHERE tenant_id = ?').all(tenantId).map(r => ({
      ...r,
      stops: JSON.parse(r.stops_json)
    }));

    const vehicles = db.prepare(`
      SELECT v.*, r.route_name
      FROM transport_vehicles v
      LEFT JOIN transport_routes r ON v.route_id = r.id
      WHERE v.tenant_id = ?
    `).all(tenantId);

    let myAllocation = null;
    if (userId) {
      myAllocation = db.prepare(`
        SELECT ta.*, tr.route_name, tv.bus_number, tv.driver_name, tv.driver_phone, tv.current_lat, tv.current_lng, tv.speed_kmh, tv.eta_minutes
        FROM transport_allocations ta
        JOIN transport_routes tr ON ta.route_id = tr.id
        LEFT JOIN transport_vehicles tv ON ta.vehicle_id = tv.id
        WHERE ta.student_id = ? AND ta.tenant_id = ?
      `).get(userId, tenantId);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ routes, vehicles, myAllocation }));
    return true;
  }

  // =========================================================================
  // MODULE 12: EVENTS & STUDENT ACTIVITIES
  // =========================================================================
  if (pathname === '/api/events' && req.method === 'GET') {
    const events = db.prepare(`
      SELECT e.*, c.name as club_name,
        (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.user_id = ?) as is_registered
      FROM events e
      LEFT JOIN student_clubs c ON e.club_id = c.id
      WHERE e.tenant_id = ?
      ORDER BY e.event_date ASC
    `).all(userId, tenantId);

    const clubs = db.prepare('SELECT * FROM student_clubs WHERE tenant_id = ?').all(tenantId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ events, clubs }));
    return true;
  }

  if (pathname === '/api/events/register' && req.method === 'POST') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    if (req.user.role !== 'STUDENT') {
      sendJson(403, { error: 'STUDENT_ONLY' });
      return true;
    }
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    if (!eventId) {
      sendJson(400, { error: 'INVALID_EVENT_ID' });
      return true;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const event = db.prepare(`
        SELECT id, capacity, registered_count, requires_approval, dean_approval_status, event_date
        FROM events WHERE id = ? AND tenant_id = ?
      `).get(eventId, tenantId);
      if (!event) {
        db.exec('ROLLBACK');
        sendJson(404, { error: 'EVENT_NOT_FOUND' });
        return true;
      }
      if (event.dean_approval_status !== 'APPROVED') {
        db.exec('ROLLBACK');
        sendJson(409, { error: 'EVENT_NOT_APPROVED' });
        return true;
      }
      if (event.event_date < new Date().toISOString().slice(0, 10)) {
        db.exec('ROLLBACK');
        sendJson(409, { error: 'EVENT_CLOSED' });
        return true;
      }
      const existing = db.prepare(`
        SELECT id, qr_ticket FROM event_registrations
        WHERE event_id = ? AND user_id = ? AND tenant_id = ?
      `).get(eventId, req.user.id, tenantId);
      if (existing) {
        db.exec('COMMIT');
        sendJson(200, { success: true, alreadyRegistered: true, qrTicket: existing.qr_ticket });
        return true;
      }
      if (Number(event.registered_count) >= Number(event.capacity)) {
        db.exec('ROLLBACK');
        sendJson(409, { error: 'EVENT_FULL' });
        return true;
      }

      const regId = 'ereg_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
      const qrTicket = 'EVT_' + crypto.randomUUID().replaceAll('-', '');
      db.prepare(`
        INSERT INTO event_registrations (id, tenant_id, event_id, user_id, qr_ticket)
        VALUES (?, ?, ?, ?, ?)
      `).run(regId, tenantId, eventId, req.user.id, qrTicket);
      const updated = db.prepare(`
        UPDATE events SET registered_count = registered_count + 1
        WHERE id = ? AND tenant_id = ? AND registered_count < capacity
      `).run(eventId, tenantId);
      if (updated.changes !== 1) throw new Error('Event capacity changed during registration.');
      db.exec('COMMIT');
      logAuditEvent(tenantId, req.user.id, 'EVENT_REGISTER', 'EVENT', eventId,
        req.socket?.remoteAddress, { registrationId: regId });
      sendJson(201, { success: true, qrTicket, registrationId: regId });
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      console.error('Event registration failed:', error);
      sendJson(409, { error: 'EVENT_REGISTRATION_FAILED', message: 'The event registration could not be completed.' });
    }
    return true;
  }

  // =========================================================================
  // MODULE 13: CAFETERIA & MESS
  // =========================================================================
  if (pathname === '/api/cafeteria/menu' && req.method === 'GET') {
    const menu = db.prepare('SELECT * FROM cafeteria_items WHERE tenant_id = ? AND available = 1 ORDER BY category, name')
      .all(tenantId);
    let activeMessSub = null;
    let recentOrders = [];
    if (userId) {
      activeMessSub = db.prepare('SELECT * FROM mess_subscriptions WHERE student_id = ? AND tenant_id = ? AND status = "ACTIVE"')
        .get(userId, tenantId);
      recentOrders = db.prepare('SELECT * FROM cafeteria_orders WHERE user_id = ? AND tenant_id = ? ORDER BY ordered_at DESC LIMIT 5')
        .all(userId, tenantId).map((order) => ({ ...order, items: JSON.parse(order.items_json) }));
    }
    sendJson(200, { menu, activeMessSub, recentOrders });
    return true;
  }

  if (pathname === '/api/cafeteria/order' && req.method === 'POST') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const requested = Array.isArray(body.items) ? body.items : [];
    if (requested.length < 1 || requested.length > 20) {
      sendJson(400, { error: 'INVALID_ORDER', message: 'An order must contain between 1 and 20 menu items.' });
      return true;
    }
    const normalized = [];
    let totalAmount = 0;
    for (const entry of requested) {
      const itemId = typeof entry.item_id === 'string' ? entry.item_id :
        (typeof entry.id === 'string' ? entry.id : '');
      const quantity = Number(entry.qty ?? entry.quantity);
      if (!itemId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        sendJson(400, { error: 'INVALID_ORDER_ITEM' });
        return true;
      }
      const menuItem = db.prepare(`
        SELECT id, name, price FROM cafeteria_items
        WHERE id = ? AND tenant_id = ? AND available = 1
      `).get(itemId, tenantId);
      if (!menuItem) {
        sendJson(409, { error: 'MENU_ITEM_UNAVAILABLE', itemId });
        return true;
      }
      const lineTotal = Number((Number(menuItem.price) * quantity).toFixed(2));
      totalAmount = Number((totalAmount + lineTotal).toFixed(2));
      normalized.push({ item_id: menuItem.id, name: menuItem.name, qty: quantity, price: Number(menuItem.price) });
    }
    const orderId = 'ord_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    const tokenNumber = crypto.randomInt(101, 999);
    // Cafeteria checkout is not connected to a payment gateway yet: do not mark the order PAID or READY.
    db.prepare(`
      INSERT INTO cafeteria_orders
        (id, tenant_id, user_id, token_number, total_amount, payment_status, order_status, items_json)
      VALUES (?, ?, ?, ?, ?, 'PENDING', 'PENDING_PAYMENT', ?)
    `).run(orderId, tenantId, req.user.id, tokenNumber, totalAmount, JSON.stringify(normalized));
    sendJson(201, {
      success: true, orderId, tokenNumber, totalAmount, paymentStatus: 'PENDING',
      orderStatus: 'PENDING_PAYMENT',
      message: 'Order saved. Payment is not yet enabled for cafeteria orders.'
    });
    return true;
  }

  // MODULE 14: RESOURCE BOOKING
  // =========================================================================
  if (pathname === '/api/resources' && req.method === 'GET') {
    if (!req.user) { sendJson(401, { error: 'UNAUTHORIZED' }); return true; }
    const resources = db.prepare('SELECT id, tenant_id, campus_id, name, resource_type, capacity, amenities, status, requires_faculty_approval FROM campus_resources WHERE tenant_id = ?')
      .all(tenantId);
    const staff = hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN');
    const reservations = db.prepare(`
      SELECT r.id, r.resource_id, r.requested_by_user_id, r.purpose, r.date,
        r.start_time, r.end_time, r.approval_status, r.created_at,
        res.name AS resource_name,
        CASE WHEN r.requested_by_user_id = ? OR ? = 1 THEN u.name ELSE 'Campus user' END AS booked_by_name
      FROM resource_reservations r
      JOIN campus_resources res ON r.resource_id = res.id AND res.tenant_id = r.tenant_id
      JOIN users u ON r.requested_by_user_id = u.id
      WHERE r.tenant_id = ? AND (? = 1 OR r.requested_by_user_id = ?)
      ORDER BY r.date DESC, r.start_time ASC
    `).all(userId, staff ? 1 : 0, tenantId, staff ? 1 : 0, userId);
    sendJson(200, { resources, reservations });
    return true;
  }

  if (pathname === '/api/resources/book' && req.method === 'POST') {
    if (!req.user) { sendJson(401, { error: 'UNAUTHORIZED' }); return true; }
    const { resourceId, purpose, date, startTime, endTime } = body;
    const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (typeof resourceId !== 'string' || typeof purpose !== 'string' ||
        purpose.trim().length < 5 || purpose.length > 500 ||
        typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !validTime(startTime) || !validTime(endTime) || endTime <= startTime ||
        date < new Date().toISOString().slice(0, 10)) {
      sendJson(400, { error: 'INVALID_RESOURCE_BOOKING', message: 'Provide a resource, future date, valid time range, and booking purpose.' });
      return true;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const resource = db.prepare('SELECT id, status FROM campus_resources WHERE id = ? AND tenant_id = ?')
        .get(resourceId, tenantId);
      if (!resource) {
        db.exec('ROLLBACK');
        sendJson(404, { error: 'RESOURCE_NOT_FOUND' });
        return true;
      }
      if (resource.status !== 'AVAILABLE') {
        db.exec('ROLLBACK');
        sendJson(409, { error: 'RESOURCE_UNAVAILABLE' });
        return true;
      }
      const collision = db.prepare(`
        SELECT id FROM resource_reservations
        WHERE tenant_id = ? AND resource_id = ? AND date = ?
          AND approval_status IN ('PENDING', 'APPROVED')
          AND start_time < ? AND end_time > ?
        LIMIT 1
      `).get(tenantId, resourceId, date, endTime, startTime);
      if (collision) {
        db.exec('ROLLBACK');
        sendJson(409, { error: 'SLOT_OCCUPIED', message: 'The resource already has a pending or approved booking during this time.' });
        return true;
      }

      const bookingId = 'res_bk_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
      db.prepare(`
        INSERT INTO resource_reservations
          (id, tenant_id, resource_id, requested_by_user_id, purpose, date, start_time, end_time, approval_status, approved_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL)
      `).run(bookingId, tenantId, resourceId, req.user.id, purpose.trim(), date, startTime, endTime);
      db.exec('COMMIT');
      logAuditEvent(tenantId, req.user.id, 'RESOURCE_BOOKING_REQUEST', 'RESOURCE', bookingId,
        req.socket?.remoteAddress, { resourceId, date });
      sendJson(201, { success: true, bookingId, status: 'PENDING' });
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      console.error('Resource booking failed:', error);
      sendJson(500, { error: 'BOOKING_FAILED' });
    }
    return true;
  }

  if (pathname === '/api/resources/review' && req.method === 'POST') {
    if (!hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN')) {
      sendJson(req.user ? 403 : 401, { error: req.user ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      return true;
    }
    const { bookingId, decision } = body;
    if (typeof bookingId !== 'string' || !['APPROVED', 'REJECTED'].includes(decision)) {
      sendJson(400, { error: 'INVALID_REVIEW' });
      return true;
    }
    const booking = db.prepare('SELECT * FROM resource_reservations WHERE id = ? AND tenant_id = ?')
      .get(bookingId, tenantId);
    if (!booking) { sendJson(404, { error: 'BOOKING_NOT_FOUND' }); return true; }
    if (booking.approval_status !== 'PENDING') { sendJson(409, { error: 'BOOKING_ALREADY_REVIEWED' }); return true; }

    if (decision === 'APPROVED') {
      const conflict = db.prepare(`
        SELECT id FROM resource_reservations
        WHERE tenant_id = ? AND resource_id = ? AND date = ? AND id != ?
          AND approval_status = 'APPROVED'
          AND start_time < ? AND end_time > ?
        LIMIT 1
      `).get(tenantId, booking.resource_id, booking.date, booking.id, booking.end_time, booking.start_time);
      if (conflict) { sendJson(409, { error: 'SLOT_OCCUPIED' }); return true; }
    }
    db.prepare('UPDATE resource_reservations SET approval_status = ?, approved_by = ? WHERE id = ? AND tenant_id = ? AND approval_status = \'PENDING\'')
      .run(decision, req.user.id, bookingId, tenantId);
    logAuditEvent(tenantId, req.user.id, 'RESOURCE_BOOKING_REVIEW', 'RESOURCE', bookingId,
      req.socket?.remoteAddress, { decision });
    sendJson(200, { success: true, status: decision });
    return true;
  }


  // =========================================================================
  // MODULE 16: LOST & FOUND
  // =========================================================================
  if (pathname === '/api/lost-found' && req.method === 'GET') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const items = db.prepare(`
      SELECT lf.id, lf.tenant_id, lf.campus_id, lf.item_type, lf.title, lf.category,
        lf.description, lf.location, lf.photo_url, lf.status, lf.created_at,
        u.name AS reported_by_name
      FROM lost_found_items lf
      JOIN users u ON lf.reported_by_user_id = u.id
      WHERE lf.tenant_id = ?
      ORDER BY lf.created_at DESC
    `).all(tenantId);
    sendJson(200, { items });
    return true;
  }

  if (pathname === '/api/lost-found' && req.method === 'POST') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED' });
      return true;
    }
    const { itemType, title, category, description, location, photoUrl } = body;
    if (!['LOST', 'FOUND'].includes(itemType) || typeof title !== 'string' ||
        title.trim().length < 2 || title.length > 160 || typeof description !== 'string' ||
        description.length > 2000 || typeof location !== 'string' || location.length > 250) {
      sendJson(400, { error: 'INVALID_LOST_FOUND_ITEM' });
      return true;
    }
    const itemId = 'lf_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    db.prepare(`
      INSERT INTO lost_found_items
        (id, tenant_id, campus_id, item_type, title, category, description, location, photo_url, reported_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(itemId, tenantId, req.user.campus_id, itemType, title.trim(),
      String(category || 'OTHER').slice(0, 80), description.trim(), location.trim(),
      typeof photoUrl === 'string' ? photoUrl.slice(0, 1000) : null, req.user.id);
    sendJson(201, { success: true, itemId });
    return true;
  }

  // =========================================================================
  // MODULE 18: GRIEVANCES & ANTI-RAGGING
  // =========================================================================
  if (pathname === '/api/grievances' && req.method === 'GET') {
    if (!hasRole('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'WARDEN', 'COUNSELLOR')) {
      sendJson(req.user ? 403 : 401, { error: req.user ? 'FORBIDDEN' : 'UNAUTHORIZED' });
      return true;
    }
    const grievances = db.prepare(`
      SELECT g.id, g.tenant_id, g.campus_id, g.tracking_ticket_number, g.category,
        g.confidentiality_level,
        CASE WHEN g.confidentiality_level = 'STRICTLY_ANONYMOUS' THEN 'Confidential Student' ELSE u.name END AS submitter_name,
        g.subject, g.details, g.priority, g.status, g.auto_escalation_deadline, g.created_at
      FROM grievances g
      LEFT JOIN users u ON g.submitted_by_user_id = u.id
      WHERE g.tenant_id = ?
      ORDER BY CASE g.priority WHEN 'EMERGENCY_CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,
        g.created_at DESC
    `).all(tenantId);
    sendJson(200, { grievances });
    return true;
  }

  if (pathname === '/api/grievances' && req.method === 'POST') {
    if (!req.user) {
      sendJson(401, { error: 'UNAUTHORIZED', message: 'Sign in to submit a grievance.' });
      return true;
    }
    const { category, confidentialityLevel = 'CONFIDENTIAL', subject, details } = body;
    const allowedConfidentiality = new Set(['CONFIDENTIAL', 'STRICTLY_ANONYMOUS']);
    if (typeof category !== 'string' || category.length > 80 ||
        !allowedConfidentiality.has(confidentialityLevel) ||
        typeof subject !== 'string' || subject.trim().length < 4 || subject.length > 200 ||
        typeof details !== 'string' || details.trim().length < 10 || details.length > 10000) {
      sendJson(400, { error: 'INVALID_GRIEVANCE' });
      return true;
    }
    const grvId = 'grv_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    const ticketNumber = 'GRV-' + new Date().getUTCFullYear() + '-' + crypto.randomInt(1000, 9999);
    const isAntiRagging = category === 'ANTI_RAGGING';
    const priority = isAntiRagging ? 'EMERGENCY_CRITICAL' : 'HIGH';
    const submitterId = confidentialityLevel === 'STRICTLY_ANONYMOUS' ? null : req.user.id;
    db.prepare(`
      INSERT INTO grievances
        (id, tenant_id, campus_id, tracking_ticket_number, category, confidentiality_level,
         submitted_by_user_id, subject, details, priority, status, auto_escalation_deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_REVIEW', datetime('now', '+72 hours'))
    `).run(grvId, tenantId, req.user.campus_id, ticketNumber, category, confidentialityLevel,
      submitterId, subject.trim(), details.trim(), priority);
    if (isAntiRagging) WorkflowEngine.trigger(tenantId, 'ANTI_RAGGING_ALERT', { ticketNumber, subject });
    sendJson(201, { success: true, trackingTicketNumber: ticketNumber, autoEscalationDeadline: '72 Hours' });
    return true;
  }

    return false;
}
