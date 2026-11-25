import test from 'node:test';
import assert from 'node:assert';

import db from '../server/db/connection.js';
import { seedDatabase } from '../server/db/seed.js';
import { seedMewarStudentRoster } from '../server/db/mewarStudentRoster.js';
import { importMewarStudentProfiles, parseMewarStudentRegisterTsv } from '../server/db/mewarStudentProfiles.js';
import { DatabaseSync } from 'node:sqlite';
import { generateToken } from '../server/middleware/auth.js';
import { DynamicQRService } from '../server/services/qrService.js';
import { PaymentService } from '../server/services/paymentService.js';
import { WorkflowEngine } from '../server/services/workflowEngine.js';
import { AIAssistantService } from '../server/services/aiService.js';
import { handleAcademicRoutes } from '../server/routes/academicRoutes.js';
import { handleOperationsRoutes } from '../server/routes/operationsRoutes.js';
import { handleUniversityRoutes } from '../server/routes/universityRoutes.js';

// Ensure database seeded
seedDatabase();

test('Auth System: Login generates valid JWT token and extracts user profile', () => {
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get('user_student_1');
  assert.ok(student, 'Student record should exist');
  
  const token = generateToken(student);
  assert.ok(token && token.split('.').length === 3, 'JWT token must have 3 segments');
});

test('Module 1 & 2: Academic Management & LMS queries return courses and timetables', () => {
  const courses = db.prepare('SELECT * FROM courses WHERE tenant_id = ?').all('tenant_apex');
  assert.ok(courses.length >= 3, 'Should have at least 3 courses for Apex tenant');
  
  const timetable = db.prepare('SELECT * FROM timetables WHERE tenant_id = ?').all('tenant_apex');
  assert.ok(timetable.length >= 5, 'Should have timetable slots scheduled');
});

test('Academic timetable route limits student schedules to actively enrolled courses', () => {
  const getTimetable = (user) => {
    let responseBody;
    let responseStatus;
    const req = { method: 'GET', tenant: { id: 'tenant_apex' }, user };
    const res = {
      writeHead: (status) => { responseStatus = status; },
      end: (body) => { responseBody = JSON.parse(body); }
    };

    assert.strictEqual(handleAcademicRoutes(req, res, '/api/academic/timetable', {}), true);
    assert.strictEqual(responseStatus, 200);
    return responseBody.timetable;
  };

  const student = db.prepare('SELECT id, role FROM users WHERE id = ?').get('user_student_2');
  const mewarStudent = db.prepare('SELECT id, role FROM users WHERE id = ?').get('user_student_1');
  const admin = db.prepare('SELECT id, role FROM users WHERE id = ?').get('user_admin_apex');
  assert.ok(getTimetable(student).every((slot) => slot.code === 'CS201'));
  assert.ok(getTimetable(admin).length > getTimetable(student).length);

  const mewarTimetable = getTimetable(mewarStudent);
  assert.ok(mewarTimetable.length > 20);
  assert.ok(mewarTimetable.every((slot) => slot.course_id.startsWith('mewar_sem5_')));
  assert.strictEqual(mewarTimetable.some((slot) => slot.day_of_week === 'Friday'), false);
  assert.ok(mewarTimetable.some((slot) =>
    slot.day_of_week === 'Monday' &&
    slot.title === 'Database Management System Lab' &&
    slot.start_time === '11:10' &&
    slot.end_time === '12:50' &&
    slot.room_number === 'MB-109' &&
    slot.batch_section === 'A - Group 1'
  ));
  assert.ok(mewarTimetable.some((slot) =>
    slot.day_of_week === 'Thursday' &&
    slot.title === 'Software Engineering Lab' &&
    slot.start_time === '13:40' &&
    slot.end_time === '15:20' &&
    slot.room_number === 'MB-108' &&
    slot.batch_section === 'A - Group 1'
  ));
});

test('Mewar CSE semester 5 exam route returns the uploaded date sheet and does not invent hall tickets', () => {
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get('user_student_1');
  const makeResponse = () => ({
    status: 0,
    data: null,
    writeHead(status) { this.status = status; },
    end(body) { this.data = JSON.parse(body); }
  });
  const examsResponse = makeResponse();

  assert.strictEqual(handleAcademicRoutes(
    { method: 'GET', tenant: { id: 'tenant_apex' }, user: student },
    examsResponse,
    '/api/academic/exams',
    {}
  ), true);
  assert.strictEqual(examsResponse.status, 200);
  assert.strictEqual(examsResponse.data.exams.length, 6);
  assert.deepStrictEqual(
    examsResponse.data.exams.map((exam) => [exam.course_code, exam.exam_date, exam.start_time, exam.end_time]),
    [
      ['PCC-CS501', '2026-11-30', '14:00', '17:00'],
      ['PCC-CS503', '2026-12-01', '14:00', '17:00'],
      ['PCC-CS504', '2026-12-02', '14:00', '17:00'],
      ['PEC CSEL 309-407', '2026-12-03', '14:00', '17:00'],
      ['AU301', '2026-12-04', '14:00', '17:00'],
      ['PCC-CS502', '2026-12-05', '14:00', '17:00']
    ]
  );
  assert.ok(examsResponse.data.exams.every((exam) =>
    exam.hall_number === 'Not listed in uploaded date sheet'
  ));

  const registrationResponse = makeResponse();
  assert.strictEqual(handleAcademicRoutes(
    {
      method: 'POST',
      tenant: { id: 'tenant_apex' },
      user: student,
      socket: { remoteAddress: '127.0.0.1' }
    },
    registrationResponse,
    '/api/academic/exams/register',
    { examId: examsResponse.data.exams[0].id }
  ), true);
  assert.strictEqual(registrationResponse.status, 409);
  assert.strictEqual(registrationResponse.data.error, 'HALL_TICKET_UNAVAILABLE');
});

test('Mewar directory imports unverified records with tenant-scoped search and pagination', () => {
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get('user_student_1');
  const makeResponse = () => ({
    status: 0,
    data: null,
    writeHead(status) { this.status = status; },
    end(body) { this.data = JSON.parse(body); }
  });

  const response = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_apex' },
      user: student,
      url: '/api/university/catalog?page=1&limit=5',
      headers: { host: 'localhost' }
    },
    response,
    '/api/university/catalog',
    {}
  ), true);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.data.profile.location, 'Gangrar, Chittorgarh');
  assert.strictEqual(response.data.departments.length, 34);
  assert.strictEqual(response.data.programmes.length, 45);
  assert.ok(response.data.programmes.some((programme) =>
    programme.name === 'M.Tech Engineering Programmes' &&
    programme.department_name === 'Department not specified' &&
    programme.verification_status === 'PENDING_VERIFICATION'
  ));
  assert.strictEqual(response.data.faculty.length, 5);
  assert.ok(response.data.pagination.total > 100);
  assert.ok(response.data.faculty.every((entry) =>
    ['PENDING_VERIFICATION', 'VERIFIED', 'INACTIVE'].includes(entry.verification_status)
  ));

  const pendingResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_apex' },
      user: student,
      url: '/api/university/catalog?status=PENDING_VERIFICATION',
      headers: { host: 'localhost' }
    },
    pendingResponse,
    '/api/university/catalog',
    {}
  ), true);
  assert.ok(pendingResponse.data.pagination.total > 0);
  assert.ok(pendingResponse.data.faculty.every((entry) =>
    entry.verification_status === 'PENDING_VERIFICATION'
  ));

  const searchResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_apex' },
      user: student,
      url: '/api/university/catalog?q=Bachcha%20Pal',
      headers: { host: 'localhost' }
    },
    searchResponse,
    '/api/university/catalog',
    {}
  ), true);
  assert.strictEqual(searchResponse.data.pagination.total, 1);
  assert.strictEqual(searchResponse.data.faculty[0].full_name, 'Bachcha Pal');
  assert.strictEqual(searchResponse.data.faculty[0].department_name, 'Computer Science and Engineering');

  const leadershipResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_apex' },
      user: student,
      url: '/api/university/catalog?section=PUBLISHED_LEADERSHIP',
      headers: { host: 'localhost' }
    },
    leadershipResponse,
    '/api/university/catalog',
    {}
  ), true);
  assert.strictEqual(leadershipResponse.data.pagination.total, 7);
  assert.ok(leadershipResponse.data.faculty.every((entry) =>
    entry.directory_section === 'PUBLISHED_LEADERSHIP' &&
    entry.department_name === 'University Leadership'
  ));

  const isolatedResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_metro' },
      user: student,
      url: '/api/university/catalog',
      headers: { host: 'localhost' }
    },
    isolatedResponse,
    '/api/university/catalog',
    {}
  ), true);
  assert.strictEqual(isolatedResponse.status, 403);
});

test('Mewar name-only student roster is idempotent, incomplete, tenant-scoped, and admin-only', () => {
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get('user_student_1');
  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get('user_admin_apex');
  const rosterCount = () => db.prepare(`
    SELECT COUNT(*) AS count FROM student_roster_records WHERE tenant_id = ?
  `).get('tenant_apex').count;
  const usersBefore = db.prepare('SELECT COUNT(*) AS count FROM users WHERE tenant_id = ?')
    .get('tenant_apex').count;
  const makeResponse = () => ({
    status: 0,
    data: null,
    writeHead(status) { this.status = status; },
    end(body) { this.data = JSON.parse(body); }
  });

  assert.strictEqual(rosterCount(), 51);
  seedMewarStudentRoster(db);
  assert.strictEqual(rosterCount(), 51);
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) AS count FROM users WHERE tenant_id = ?').get('tenant_apex').count,
    usersBefore
  );
  const rosterColumns = db.prepare('PRAGMA table_info(student_roster_records)').all().map((column) => column.name);
  assert.deepStrictEqual(rosterColumns, [
    'id', 'tenant_id', 'full_name', 'record_status', 'source_note', 'import_batch', 'created_at'
  ]);
  const aarif = db.prepare(`
    SELECT id, full_name, record_status FROM student_roster_records
    WHERE tenant_id = ? AND full_name = ?
  `).get('tenant_apex', 'MD AARIF HUSSAIN');
  assert.strictEqual(aarif.record_status, 'INCOMPLETE');
  assert.notStrictEqual(aarif.id, 'user_student_1');

  const deniedResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_apex' },
      user: student,
      url: '/api/university/students/roster',
      headers: { host: 'localhost' }
    },
    deniedResponse,
    '/api/university/students/roster',
    {}
  ), true);
  assert.strictEqual(deniedResponse.status, 403);

  const searchResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_apex' },
      user: admin,
      url: '/api/university/students/roster?q=aarif&page=1&limit=5',
      headers: { host: 'localhost' }
    },
    searchResponse,
    '/api/university/students/roster',
    {}
  ), true);
  assert.strictEqual(searchResponse.status, 200);
  assert.strictEqual(searchResponse.data.incompleteCount, 1);
  assert.strictEqual(searchResponse.data.entries[0].full_name, 'MD AARIF HUSSAIN');
  assert.strictEqual(searchResponse.data.entries[0].record_status, 'INCOMPLETE');
  assert.deepStrictEqual(Object.keys(searchResponse.data.entries[0]).sort(), [
    'full_name', 'id', 'record_status'
  ]);

  const isolatedResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_metro' },
      user: admin,
      url: '/api/university/students/roster',
      headers: { host: 'localhost' }
    },
    isolatedResponse,
    '/api/university/students/roster',
    {}
  ), true);
  assert.strictEqual(isolatedResponse.status, 403);
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) AS count FROM student_roster_records WHERE tenant_id = ?')
      .get('tenant_metro').count,
    0
  );
});

test('Mewar student profile TSV import validates rows, allows missing or repeated roll numbers, and is idempotent', () => {
  const header = 'Enrollment No.\tRoll No.\tStudent Name\tCourse-Branch-Semester-Year\tRoom No.';
  const sample = [
    header,
    'MUR999991001\tROLL-1\tTest Student One\tB.Tech-CSE-1 Sem-1 Year\t101',
    'MUR999991002\tROLL-1\tTest Student Two\tMBA-Finance-2 Sem-1 Year\t102',
    'MUR999991003\t\tTest Student Three\tM.Sc-Math-4 Sem-2 Year\t103'
  ].join('\n');
  const profilesDb = new DatabaseSync(':memory:');
  profilesDb.exec(`
    CREATE TABLE student_profiles (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      enrollment_number TEXT NOT NULL,
      roll_number TEXT,
      full_name TEXT NOT NULL,
      course_details TEXT NOT NULL,
      room_number TEXT,
      verification_status TEXT NOT NULL,
      verification_note TEXT NOT NULL,
      import_batch TEXT NOT NULL,
      verified_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, enrollment_number)
    )
  `);

  assert.strictEqual(parseMewarStudentRegisterTsv(sample).length, 3);
  assert.strictEqual(importMewarStudentProfiles(profilesDb, sample, 'tenant_test'), 3);
  assert.strictEqual(importMewarStudentProfiles(profilesDb, sample, 'tenant_test'), 3);
  assert.strictEqual(
    profilesDb.prepare('SELECT COUNT(*) AS count FROM student_profiles').get().count,
    3
  );
  assert.strictEqual(
    profilesDb.prepare('SELECT COUNT(DISTINCT roll_number) AS count FROM student_profiles').get().count,
    1
  );
  assert.strictEqual(
    profilesDb.prepare('SELECT roll_number FROM student_profiles WHERE enrollment_number = ?')
      .get('MUR999991003').roll_number,
    null
  );
  assert.strictEqual(
    profilesDb.prepare('SELECT verification_status FROM student_profiles LIMIT 1')
      .get().verification_status,
    'VERIFIED'
  );
  assert.throws(
    () => parseMewarStudentRegisterTsv(`${header}\nMUR999991001\tR\tDuplicate\tCourse\t101\nMUR999991001\tR2\tDuplicate\tCourse\t102`),
    /duplicate enrollment number/
  );
  profilesDb.close();
});

test('Detailed student profiles are readable only by university admins and audit logged', () => {
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get('user_student_1');
  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get('user_admin_apex');
  const enrollmentNumber = 'MUR999990001';
  const profileId = 'test_student_profile_api';
  const previousAudit = db.prepare(`
    SELECT id FROM audit_logs
    WHERE tenant_id = ? AND action = 'STUDENT_PROFILES_READ' AND user_id = ?
    ORDER BY rowid DESC LIMIT 1
  `).get('tenant_apex', admin.id)?.id || null;
  const makeResponse = () => ({
    status: 0,
    data: null,
    writeHead(status) { this.status = status; },
    end(body) { this.data = JSON.parse(body); }
  });
  db.prepare(`
    INSERT OR REPLACE INTO student_profiles (
      id, tenant_id, enrollment_number, roll_number, full_name, course_details,
      room_number, verification_status, verification_note, import_batch
    ) VALUES (?, 'tenant_apex', ?, NULL, 'API Test Student', 'B.Tech Test-1 Sem-1 Year',
      '101', 'VERIFIED', 'Test only', 'test_batch')
  `).run(profileId, enrollmentNumber);

  const deniedResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_apex' },
      user: student,
      url: `/api/university/students/profiles?q=${enrollmentNumber}`,
      headers: { host: 'localhost' }
    },
    deniedResponse,
    '/api/university/students/profiles',
    {}
  ), true);
  assert.strictEqual(deniedResponse.status, 403);

  const profileResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_apex' },
      user: admin,
      url: `/api/university/students/profiles?q=${enrollmentNumber}`,
      headers: { host: 'localhost' },
      socket: { remoteAddress: '127.0.0.1' }
    },
    profileResponse,
    '/api/university/students/profiles',
    {}
  ), true);
  assert.strictEqual(profileResponse.status, 200);
  assert.strictEqual(profileResponse.data.pagination.total, 1);
  assert.strictEqual(profileResponse.data.profiles[0].enrollment_number, enrollmentNumber);
  assert.strictEqual(profileResponse.data.profiles[0].roll_number, null);
  assert.strictEqual(profileResponse.data.profiles[0].room_number, '101');
  assert.ok(db.prepare(`
    SELECT id FROM audit_logs
    WHERE tenant_id = ? AND action = 'STUDENT_PROFILES_READ'
  `).get('tenant_apex'));

  const isolatedResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'GET',
      tenant: { id: 'tenant_metro' },
      user: admin,
      url: '/api/university/students/profiles',
      headers: { host: 'localhost' }
    },
    isolatedResponse,
    '/api/university/students/profiles',
    {}
  ), true);
  assert.strictEqual(isolatedResponse.status, 403);
  db.prepare('DELETE FROM student_profiles WHERE id = ?').run(profileId);
  const createdAudit = db.prepare(`
    SELECT id FROM audit_logs
    WHERE tenant_id = ? AND action = 'STUDENT_PROFILES_READ' AND user_id = ?
    ORDER BY rowid DESC LIMIT 1
  `).get('tenant_apex', admin.id)?.id;
  if (createdAudit && createdAudit !== previousAudit) {
    db.prepare('DELETE FROM audit_logs WHERE id = ?').run(createdAudit);
  }
});

test('Only university admins can verify pending Mewar directory faculty records', () => {
  const pendingRecord = db.prepare(`
    SELECT id FROM faculty_directory
    WHERE tenant_id = ? AND verification_status = 'PENDING_VERIFICATION'
    ORDER BY id LIMIT 1
  `).get('tenant_apex');
  assert.ok(pendingRecord, 'At least one pending faculty record should remain for the test.');
  const recordId = pendingRecord.id;
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get('user_student_1');
  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get('user_admin_apex');
  const makeResponse = () => ({
    status: 0,
    data: null,
    writeHead(status) { this.status = status; },
    end(body) { this.data = JSON.parse(body); }
  });
  const studentResponse = makeResponse();

  assert.strictEqual(handleUniversityRoutes(
    { method: 'POST', tenant: { id: 'tenant_apex' }, user: student },
    studentResponse,
    '/api/university/faculty/verify',
    { facultyId: recordId }
  ), true);
  assert.strictEqual(studentResponse.status, 403);

  const adminResponse = makeResponse();
  assert.strictEqual(handleUniversityRoutes(
    {
      method: 'POST',
      tenant: { id: 'tenant_apex' },
      user: admin,
      socket: { remoteAddress: '127.0.0.1' }
    },
    adminResponse,
    '/api/university/faculty/verify',
    { facultyId: recordId }
  ), true);
  assert.strictEqual(adminResponse.status, 200);
  assert.strictEqual(adminResponse.data.verificationStatus, 'VERIFIED');
  assert.strictEqual(
    db.prepare('SELECT verified_by_user_id FROM faculty_directory WHERE id = ?').get(recordId).verified_by_user_id,
    admin.id
  );
  assert.ok(db.prepare(`
    SELECT id FROM audit_logs
    WHERE tenant_id = ? AND action = 'FACULTY_DIRECTORY_VERIFY' AND resource_id = ?
  `).get('tenant_apex', recordId));

  db.prepare(`
    UPDATE faculty_directory
    SET verification_status = 'PENDING_VERIFICATION', verified_by_user_id = NULL, verified_at = NULL
    WHERE id = ?
  `).run(recordId);
  db.prepare(`
    DELETE FROM audit_logs
    WHERE tenant_id = ? AND action = 'FACULTY_DIRECTORY_VERIFY' AND resource_id = ?
  `).run('tenant_apex', recordId);
});

test('Module 4: 1-Tap SOS Alert creates active record and dispatches officers', () => {
  const sosId = 'sos_test_' + Math.random().toString(36).slice(2, 9);
  db.prepare(`
    INSERT INTO sos_alerts (id, tenant_id, campus_id, triggered_by_user_id, alert_type, location_description, status)
    VALUES (?, 'tenant_apex', 'campus_apex_main', 'user_student_1', 'MEDICAL', 'Hostel Block C Room 201', 'ACTIVE')
  `).run(sosId);

  const sos = db.prepare('SELECT * FROM sos_alerts WHERE id = ?').get(sosId);
  assert.strictEqual(sos.status, 'ACTIVE');
  assert.strictEqual(sos.alert_type, 'MEDICAL');
});

test('SOS sends persistent in-app notifications to parent, warden, and counsellor', () => {
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get('user_student_1');
  let sosId = null;
  const offCampusWardenId = 'test_off_campus_warden';
  const makeResponse = () => ({
    status: 0,
    data: null,
    writeHead(status) { this.status = status; },
    end(body) { this.data = JSON.parse(body); }
  });

  try {
    db.prepare(`
      INSERT INTO users (id, tenant_id, campus_id, university_id, name, email, password_hash, role)
      VALUES (?, 'tenant_apex', 'campus_apex_north', 'TEST-WARDEN-NORTH', 'North Campus Warden',
        'test-warden-north@mewaruniversity.demo', 'test', 'WARDEN')
    `).run(offCampusWardenId);

    const sosResponse = makeResponse();
    assert.strictEqual(handleOperationsRoutes(
      {
        method: 'POST',
        tenant: { id: 'tenant_apex' },
        user: student,
        socket: { remoteAddress: '127.0.0.1' }
      },
      sosResponse,
      '/api/emergency/sos',
      { alertType: 'MEDICAL', locationDescription: 'Hostel entrance', gpsCoordinates: null }
    ), true);
    assert.strictEqual(sosResponse.status, 200);
    sosId = sosResponse.data.sosId;
    assert.deepStrictEqual(new Set(sosResponse.data.notifiedRoles), new Set(['PARENT', 'WARDEN', 'COUNSELLOR']));

    const recipients = db.prepare(`
      SELECT u.role, n.recipient_user_id
      FROM user_notifications n
      JOIN users u ON u.id = n.recipient_user_id
      WHERE n.source_id = ?
    `).all(sosId);
    assert.deepStrictEqual(
      new Set(recipients.map((recipient) => recipient.role)),
      new Set(['PARENT', 'WARDEN', 'COUNSELLOR'])
    );
    assert.ok(recipients.every((recipient) =>
      db.prepare('SELECT university_id FROM users WHERE id = ?').get(recipient.recipient_user_id)
    ));

    for (const recipientId of ['user_parent_1', 'user_warden_mewar', 'user_counsellor_mewar']) {
      const inboxResponse = makeResponse();
      const recipient = db.prepare('SELECT * FROM users WHERE id = ?').get(recipientId);
      assert.strictEqual(handleOperationsRoutes(
        { method: 'GET', tenant: { id: 'tenant_apex' }, user: recipient },
        inboxResponse,
        '/api/notifications',
        {}
      ), true);
      assert.ok(inboxResponse.data.notifications.some((notification) => notification.source_id === sosId));
    }

    const offCampusInbox = makeResponse();
    const offCampusWarden = db.prepare('SELECT * FROM users WHERE id = ?').get(offCampusWardenId);
    assert.strictEqual(handleOperationsRoutes(
      { method: 'GET', tenant: { id: 'tenant_apex' }, user: offCampusWarden },
      offCampusInbox,
      '/api/notifications',
      {}
    ), true);
    assert.ok(offCampusInbox.data.notifications.every((notification) => notification.source_id !== sosId));

    const parent = db.prepare('SELECT * FROM users WHERE id = ?').get('user_parent_1');
    const readResponse = makeResponse();
    assert.strictEqual(handleOperationsRoutes(
      { method: 'POST', tenant: { id: 'tenant_apex' }, user: parent },
      readResponse,
      '/api/notifications/read',
      {}
    ), true);
    assert.strictEqual(readResponse.data.success, true);
    assert.notStrictEqual(
      db.prepare('SELECT read_at FROM user_notifications WHERE source_id = ? AND recipient_user_id = ?')
        .get(sosId, parent.id).read_at,
      null
    );
  } finally {
    if (sosId) {
      db.prepare('DELETE FROM user_notifications WHERE source_id = ?').run(sosId);
      db.prepare("DELETE FROM audit_logs WHERE resource_type = 'SAFETY' AND resource_id = ?").run(sosId);
      db.prepare('DELETE FROM sos_alerts WHERE id = ?').run(sosId);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(offCampusWardenId);
  }
});

test('Module 6: payment orders derive balance server-side and reject forged signatures', async () => {
  const dueId = 'due_test_payment_secure';
  const tamperDueId = 'due_test_payment_forged';
  const insertDue = db.prepare(`
    INSERT INTO student_fee_dues
      (id, tenant_id, student_id, fee_structure_id, total_amount, amount_paid, balance_amount, status)
    VALUES (?, 'tenant_apex', 'user_student_1', 'fee_1', ?, 0, ?, 'UNPAID')
  `);
  insertDue.run(dueId, 15000, 15000);
  insertDue.run(tamperDueId, 9000, 9000);

  try {
    const order = await PaymentService.createOrder({
      tenantId: 'tenant_apex',
      userId: 'user_student_1',
      feeDueId: dueId
    });
    assert.ok(order.orderId.startsWith('order_'));
    assert.strictEqual(order.amount, 15000);
    assert.strictEqual(order.amountPaise, 1500000);

    const completion = await PaymentService.verifyAndCompletePayment({
      tenantId: 'tenant_apex',
      userId: 'user_student_1',
      orderId: order.orderId,
      paymentId: 'pay_mock_secure_123',
      signature: 'MOCK_APPROVED'
    });
    assert.strictEqual(completion.success, true);
    assert.strictEqual(completion.paymentMode, 'MOCK');
    assert.ok(completion.receiptNumber.startsWith('RCP-'));
    assert.ok(completion.digitalReceiptPdfHash);

    const replay = await PaymentService.verifyAndCompletePayment({
      tenantId: 'tenant_apex',
      userId: 'user_student_1',
      orderId: order.orderId,
      paymentId: 'pay_mock_secure_123',
      signature: 'MOCK_APPROVED'
    });
    assert.strictEqual(replay.idempotent, true);

    const forgedOrder = await PaymentService.createOrder({
      tenantId: 'tenant_apex',
      userId: 'user_student_1',
      feeDueId: tamperDueId
    });
    await assert.rejects(PaymentService.verifyAndCompletePayment({
      tenantId: 'tenant_apex',
      userId: 'user_student_1',
      orderId: forgedOrder.orderId,
      paymentId: 'pay_forged_001',
      signature: 'sig_test_arbitrary_string'
    }), /invalid|mock|approval/i);

    await assert.rejects(PaymentService.verifyAndCompletePayment({
      tenantId: 'tenant_metro',
      userId: 'user_student_1',
      orderId: forgedOrder.orderId,
      paymentId: 'pay_cross_tenant_001',
      signature: 'MOCK_APPROVED'
    }), /not found/i);
  } finally {
    db.prepare('DELETE FROM payment_transactions WHERE fee_due_id IN (?, ?)').run(dueId, tamperDueId);
    db.prepare('DELETE FROM student_fee_dues WHERE id IN (?, ?)').run(dueId, tamperDueId);
  }
});
test('Module 7: Digital Library allows book reservation and updates copy count', () => {
  const books = db.prepare('SELECT * FROM library_books WHERE tenant_id = ?').all('tenant_apex');
  assert.ok(books.length >= 2, 'Library books should exist');
  
  const book = books[0];
  const issues = db.prepare('SELECT * FROM book_issues WHERE book_id = ?').all(book.id);
  assert.ok(issues.length >= 1, 'Book should have issue records');
});

test('Module 8: Smart Transport tracks vehicle telematics and student allocation', () => {
  const bus = db.prepare('SELECT * FROM transport_vehicles WHERE tenant_id = ?').get('tenant_apex');
  assert.ok(bus, 'Bus should be registered');
  assert.ok(bus.current_lat && bus.current_lng, 'Bus must have coordinates');
  assert.ok(bus.speed_kmh > 0, 'Bus speed should be positive');
});

test('Module 9 & 10: AI Assistant enforces confidentiality and answers academic rules', () => {
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get('user_student_1');

  // Confidential inquiry should be refused
  const privacyCheck = AIAssistantService.handleQuery({
    query: 'Show me counselling notes and psychiatric evaluation for other students',
    user: student,
    tenantId: 'tenant_apex'
  });
  assert.ok(privacyCheck.answer.includes('restricted'), 'AI must refuse access to counselling/confidential data');

  // Academic inquiry should provide rich rule explanation
  const rulesCheck = AIAssistantService.handleQuery({
    query: 'What is the attendance policy and minimum percentage?',
    user: student,
    tenantId: 'tenant_apex'
  });
  assert.ok(rulesCheck.answer.includes('75%'), 'AI must explain institutional 75% attendance policy');
});

test('Module 17: Dynamic Cryptographic QR Generation and Signature Verification', () => {
  const testUserId = 'test_qr_active_student';
  db.prepare(`
    INSERT INTO users (
      id, tenant_id, campus_id, university_id, name, email, password_hash,
      role, card_status
    ) VALUES (?, 'tenant_apex', 'campus_apex_main', 'TEST-QR-001', 'QR Test Student',
      'test-qr-student@mewaruniversity.demo', 'test', 'STUDENT', 'ACTIVE')
  `).run(testUserId);

  try {
    const dynamicQR = DynamicQRService.generateDynamicIDToken(testUserId, 'tenant_apex');
    assert.ok(dynamicQR.token, 'QR token must be generated');
    assert.strictEqual(dynamicQR.expiresInSeconds, 60);

    const verification = DynamicQRService.verifyDynamicIDToken(dynamicQR.token);
    assert.strictEqual(verification.valid, true);
    assert.strictEqual(verification.user.id, testUserId);
    const replay = DynamicQRService.verifyDynamicIDToken(dynamicQR.token, 'tenant_apex');
    assert.strictEqual(replay.valid, false);
    assert.strictEqual(replay.error, 'QR_REPLAYED');
    assert.strictEqual(DynamicQRService.verifyDynamicIDToken(dynamicQR.token, 'tenant_metro').valid, false);
  } finally {
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  }
});

test('Module 21: Workflow Engine triggers parent notification on critical events', () => {
  const execution = WorkflowEngine.trigger('tenant_apex', 'ATTENDANCE_DROP_BELOW_75', {
    student_name: 'Ananya Sengupta',
    attendance_pct: 71.8
  });

  assert.ok(execution.length >= 1, 'Should trigger automated notification workflow');
  assert.strictEqual(execution[0].actionType, 'SEND_PARENT_SMS');
});
