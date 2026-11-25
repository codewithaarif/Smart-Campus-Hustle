import crypto from 'node:crypto';
import db from '../db/connection.js';
import { logAuditEvent } from '../middleware/audit.js';

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
};
const isStaff = (user) => ['FACULTY', 'UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'PLATFORM_OWNER'].includes(user?.role);

export function handleAcademicRoutes(req, res, pathname, body) {
  const tenantId = req.tenant?.id || '';
  const user = req.user;
  const userId = user?.id || '';

  if (pathname === '/api/academic/courses' && req.method === 'GET') {
    const courses = db.prepare(`
      SELECT c.*, COUNT(DISTINCT ce.id) AS enrolled_count
      FROM courses c
      LEFT JOIN course_enrollments ce
        ON c.id = ce.course_id AND ce.tenant_id = c.tenant_id AND ce.status = 'ACTIVE'
      WHERE c.tenant_id = ? AND (
        ? != 'STUDENT' OR EXISTS (
          SELECT 1 FROM course_enrollments own
          WHERE own.course_id = c.id AND own.tenant_id = c.tenant_id
            AND own.student_id = ? AND own.status = 'ACTIVE'
        )
      )
      GROUP BY c.id ORDER BY c.code
    `).all(tenantId, user?.role || '', userId);
    json(res, 200, { courses });
    return true;
  }

  if (pathname === '/api/academic/timetable' && req.method === 'GET') {
    const timetable = db.prepare(`
      SELECT t.*, c.code, c.title, c.department, u.name AS faculty_name
      FROM timetables t
      JOIN courses c ON c.id = t.course_id AND c.tenant_id = t.tenant_id
      JOIN users u ON u.id = t.faculty_id AND u.tenant_id = t.tenant_id
      WHERE t.tenant_id = ? AND (
        (? = 'STUDENT' AND EXISTS (
          SELECT 1 FROM course_enrollments ce WHERE ce.course_id = t.course_id
            AND ce.student_id = ? AND ce.tenant_id = t.tenant_id AND ce.status = 'ACTIVE'
        )) OR
        (? = 'FACULTY' AND t.faculty_id = ?) OR
        (? IN ('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'PLATFORM_OWNER'))
      )
      ORDER BY CASE t.day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2
        WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END,
        t.start_time
    `).all(tenantId, user?.role || '', userId, user?.role || '', userId, user?.role || '');
    json(res, 200, { timetable });
    return true;
  }

  if (pathname === '/api/academic/assignments' && req.method === 'GET') {
    const assignments = db.prepare(`
      SELECT a.*, c.code AS course_code, c.title AS course_title, u.name AS faculty_name,
        (SELECT COUNT(*) FROM assignment_submissions s
         WHERE s.assignment_id = a.id AND s.tenant_id = a.tenant_id) AS submission_count,
        (SELECT s.marks_obtained FROM assignment_submissions s
         WHERE s.assignment_id = a.id AND s.student_id = ? AND s.tenant_id = a.tenant_id
         ORDER BY s.submitted_at DESC LIMIT 1) AS user_marks,
        (SELECT s.feedback FROM assignment_submissions s
         WHERE s.assignment_id = a.id AND s.student_id = ? AND s.tenant_id = a.tenant_id
         ORDER BY s.submitted_at DESC LIMIT 1) AS user_feedback,
        (SELECT s.submitted_at FROM assignment_submissions s
         WHERE s.assignment_id = a.id AND s.student_id = ? AND s.tenant_id = a.tenant_id
         ORDER BY s.submitted_at DESC LIMIT 1) AS user_submitted_at
      FROM assignments a
      JOIN courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id
      JOIN users u ON u.id = a.faculty_id AND u.tenant_id = a.tenant_id
      WHERE a.tenant_id = ? AND (
        (? = 'STUDENT' AND EXISTS (
          SELECT 1 FROM course_enrollments ce WHERE ce.course_id = a.course_id
            AND ce.student_id = ? AND ce.tenant_id = a.tenant_id AND ce.status = 'ACTIVE'
        )) OR (? = 'FACULTY' AND a.faculty_id = ?) OR
        (? IN ('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'PLATFORM_OWNER'))
      )
      ORDER BY a.due_date ASC
    `).all(userId, userId, userId, tenantId, user?.role || '', userId,
      user?.role || '', userId, user?.role || '');
    json(res, 200, { assignments });
    return true;
  }

  if (pathname === '/api/academic/assignments/submit' && req.method === 'POST') {
    if (user?.role !== 'STUDENT') { json(res, user ? 403 : 401, { error: user ? 'STUDENT_ONLY' : 'UNAUTHORIZED' }); return true; }
    const assignmentId = typeof body.assignmentId === 'string' ? body.assignmentId : '';
    const contentText = typeof body.contentText === 'string' ? body.contentText.trim() : '';
    const attachmentUrl = typeof body.attachmentUrl === 'string' ? body.attachmentUrl.trim() : '';
    if (!assignmentId || contentText.length > 20_000 || attachmentUrl.length > 1000 ||
        (!contentText && !attachmentUrl) ||
        (attachmentUrl && !attachmentUrl.startsWith('/') && !/^https:\/\//i.test(attachmentUrl))) {
      json(res, 400, { error: 'INVALID_SUBMISSION' });
      return true;
    }
    const assignment = db.prepare(`
      SELECT a.id, a.course_id, a.due_date
      FROM assignments a
      WHERE a.id = ? AND a.tenant_id = ? AND EXISTS (
        SELECT 1 FROM course_enrollments ce WHERE ce.course_id = a.course_id
          AND ce.student_id = ? AND ce.tenant_id = a.tenant_id AND ce.status = 'ACTIVE'
      )
    `).get(assignmentId, tenantId, user.id);
    if (!assignment) { json(res, 404, { error: 'ASSIGNMENT_NOT_FOUND_OR_NOT_ENROLLED' }); return true; }
    const existing = db.prepare('SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ? AND tenant_id = ?')
      .get(assignmentId, user.id, tenantId);
    if (existing) { json(res, 409, { error: 'ALREADY_SUBMITTED', submissionId: existing.id }); return true; }
    const submissionId = 'sub_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    db.prepare(`
      INSERT INTO assignment_submissions
        (id, tenant_id, assignment_id, student_id, content_text, attachment_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(submissionId, tenantId, assignmentId, user.id,
      contentText || null, attachmentUrl || null);
    logAuditEvent(tenantId, user.id, 'SUBMIT_ASSIGNMENT', 'ASSIGNMENT', assignmentId,
      req.socket?.remoteAddress, { submissionId });
    json(res, 201, { success: true, submissionId, message: 'Assignment submission recorded.' });
    return true;
  }

  if (pathname === '/api/academic/lms-materials' && req.method === 'GET') {
    const materials = db.prepare(`
      SELECT m.id, m.tenant_id, m.course_id, m.title, m.material_type, m.file_url,
        m.file_size_kb, m.description, m.created_at, c.code AS course_code, c.title AS course_title
      FROM lms_materials m
      JOIN courses c ON c.id = m.course_id AND c.tenant_id = m.tenant_id
      WHERE m.tenant_id = ? AND (
        (? = 'STUDENT' AND EXISTS (
          SELECT 1 FROM course_enrollments ce WHERE ce.course_id = m.course_id
            AND ce.student_id = ? AND ce.tenant_id = m.tenant_id AND ce.status = 'ACTIVE'
        )) OR (? = 'FACULTY' AND EXISTS (
          SELECT 1 FROM timetables t WHERE t.course_id = m.course_id
            AND t.faculty_id = ? AND t.tenant_id = m.tenant_id
        )) OR (? IN ('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'PLATFORM_OWNER'))
      )
      ORDER BY m.created_at DESC
    `).all(tenantId, user?.role || '', userId, user?.role || '', userId, user?.role || '');
    json(res, 200, { materials });
    return true;
  }

  if (pathname === '/api/academic/quizzes' && req.method === 'GET') {
    const quizzes = db.prepare(`
      SELECT q.*, c.code AS course_code, c.title AS course_title,
        (SELECT qa.score FROM quiz_attempts qa WHERE qa.quiz_id = q.id
          AND qa.student_id = ? AND qa.tenant_id = q.tenant_id
          ORDER BY qa.completed_at DESC LIMIT 1) AS user_score,
        (SELECT qa.completed_at FROM quiz_attempts qa WHERE qa.quiz_id = q.id
          AND qa.student_id = ? AND qa.tenant_id = q.tenant_id
          ORDER BY qa.completed_at DESC LIMIT 1) AS completed_at
      FROM quizzes q
      JOIN courses c ON c.id = q.course_id AND c.tenant_id = q.tenant_id
      WHERE q.tenant_id = ? AND (
        (? = 'STUDENT' AND EXISTS (
          SELECT 1 FROM course_enrollments ce WHERE ce.course_id = q.course_id
            AND ce.student_id = ? AND ce.tenant_id = q.tenant_id AND ce.status = 'ACTIVE'
        )) OR (? = 'FACULTY' AND EXISTS (
          SELECT 1 FROM timetables t WHERE t.course_id = q.course_id
            AND t.faculty_id = ? AND t.tenant_id = q.tenant_id
        )) OR (? IN ('UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'PLATFORM_OWNER'))
      )
    `).all(userId, userId, tenantId, user?.role || '', userId, user?.role || '', userId, user?.role || '');
    for (const quiz of quizzes) {
      quiz.questions = db.prepare(`
        SELECT id, question_text, options_json, points
        FROM quiz_questions WHERE quiz_id = ?
      `).all(quiz.id).map((question) => ({
        ...question,
        options: JSON.parse(question.options_json || '[]')
      }));
    }
    json(res, 200, { quizzes });
    return true;
  }

  if (pathname === '/api/academic/quizzes/submit' && req.method === 'POST') {
    if (user?.role !== 'STUDENT') { json(res, user ? 403 : 401, { error: user ? 'STUDENT_ONLY' : 'UNAUTHORIZED' }); return true; }
    const quizId = typeof body.quizId === 'string' ? body.quizId : '';
    const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : null;
    if (!quizId || !answers || Object.keys(answers).length > 200) { json(res, 400, { error: 'INVALID_QUIZ_SUBMISSION' }); return true; }
    const quiz = db.prepare(`
      SELECT q.* FROM quizzes q
      WHERE q.id = ? AND q.tenant_id = ? AND EXISTS (
        SELECT 1 FROM course_enrollments ce WHERE ce.course_id = q.course_id
          AND ce.student_id = ? AND ce.tenant_id = q.tenant_id AND ce.status = 'ACTIVE'
      )
    `).get(quizId, tenantId, user.id);
    if (!quiz) { json(res, 404, { error: 'QUIZ_NOT_FOUND_OR_NOT_ENROLLED' }); return true; }
    const now = Date.now();
    if ((quiz.starts_at && new Date(quiz.starts_at).getTime() > now) ||
        (quiz.ends_at && new Date(quiz.ends_at).getTime() < now)) {
      json(res, 409, { error: 'QUIZ_NOT_OPEN' });
      return true;
    }
    const prior = db.prepare('SELECT id FROM quiz_attempts WHERE quiz_id = ? AND student_id = ? AND tenant_id = ?')
      .get(quizId, user.id, tenantId);
    if (prior) { json(res, 409, { error: 'QUIZ_ALREADY_SUBMITTED', attemptId: prior.id }); return true; }
    const questions = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ?')
      .all(quizId);
    if (!questions.length) { json(res, 409, { error: 'QUIZ_HAS_NO_QUESTIONS' }); return true; }

    let totalScore = 0;
    const feedback = [];
    for (const question of questions) {
      const options = JSON.parse(question.options_json || '[]');
      const selected = answers[question.id];
      if (!Number.isInteger(selected) || selected < 0 || selected >= options.length) {
        json(res, 400, { error: 'INVALID_QUIZ_ANSWER', questionId: question.id });
        return true;
      }
      const correct = selected === question.correct_option_index;
      if (correct) totalScore += Number(question.points);
      feedback.push({ questionId: question.id, selected, correctIndex: question.correct_option_index, isCorrect: correct });
    }
    const attemptId = 'attempt_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    db.prepare(`
      INSERT INTO quiz_attempts (id, tenant_id, quiz_id, student_id, score, answers_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(attemptId, tenantId, quizId, user.id, totalScore, JSON.stringify(answers));
    json(res, 201, {
      success: true,
      score: totalScore,
      maxMarks: questions.reduce((sum, question) => sum + Number(question.points), 0),
      feedback
    });
    return true;
  }

  if (pathname === '/api/academic/exams' && req.method === 'GET') {
    const exams = db.prepare(`
      SELECT e.*, c.code AS course_code, c.title AS course_title,
        er.id AS registration_id, er.registration_status, er.hall_ticket_number,
        er.seat_allotment, er.qr_verification_code
      FROM exam_schedules e
      JOIN courses c ON c.id = e.course_id AND c.tenant_id = e.tenant_id
      LEFT JOIN exam_registrations er ON er.exam_id = e.id AND er.student_id = ? AND er.tenant_id = e.tenant_id
      WHERE e.tenant_id = ? AND (
        (? = 'STUDENT' AND EXISTS (
          SELECT 1 FROM course_enrollments ce WHERE ce.course_id = e.course_id
            AND ce.student_id = ? AND ce.tenant_id = e.tenant_id AND ce.status = 'ACTIVE'
        )) OR (? IN ('FACULTY', 'UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'PLATFORM_OWNER'))
      )
      ORDER BY e.exam_date ASC
    `).all(userId, tenantId, user?.role || '', userId, user?.role || '');
    json(res, 200, { exams });
    return true;
  }

  if (pathname === '/api/academic/exams/register' && req.method === 'POST') {
    if (user?.role !== 'STUDENT') { json(res, user ? 403 : 401, { error: user ? 'STUDENT_ONLY' : 'UNAUTHORIZED' }); return true; }
    const examId = typeof body.examId === 'string' ? body.examId : '';
    if (!examId) { json(res, 400, { error: 'INVALID_EXAM_ID' }); return true; }

    const exam = db.prepare(`
      SELECT e.id, e.hall_number, e.exam_date, e.registration_deadline, e.course_id
      FROM exam_schedules e
      WHERE e.id = ? AND e.tenant_id = ? AND date(e.exam_date) >= date('now')
        AND EXISTS (
          SELECT 1 FROM course_enrollments ce WHERE ce.course_id = e.course_id
            AND ce.student_id = ? AND ce.tenant_id = e.tenant_id AND ce.status = 'ACTIVE'
        )
    `).get(examId, tenantId, user.id);
    if (!exam) { json(res, 404, { error: 'EXAM_NOT_FOUND_OR_NOT_ENROLLED' }); return true; }
    if (exam.registration_deadline && new Date(exam.registration_deadline).getTime() < Date.now()) { json(res, 409, { error: 'REGISTRATION_CLOSED' }); return true; }
    if (!exam.hall_number || exam.hall_number === 'Not listed in uploaded date sheet') {
      json(res, 409, { error: 'HALL_TICKET_UNAVAILABLE', message: 'Official hall and seat allocation are not available in the institution timetable.' });
      return true;
    }
    const prior = db.prepare('SELECT id, hall_ticket_number, seat_allotment, qr_verification_code FROM exam_registrations WHERE exam_id = ? AND student_id = ? AND tenant_id = ?')
      .get(examId, user.id, tenantId);
    if (prior) {
      json(res, 200, { success: true, alreadyRegistered: true, registrationId: prior.id,
        hallTicketNumber: prior.hall_ticket_number, seatAllotment: prior.seat_allotment, qrCode: prior.qr_verification_code });
      return true;
    }

    const registrationId = 'ereg_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    const hallTicketNumber = 'HT-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const qrCode = 'EXAM_' + crypto.randomBytes(20).toString('hex');
    db.prepare(`
      INSERT INTO exam_registrations
        (id, tenant_id, exam_id, student_id, registration_status, hall_ticket_number, seat_allotment, qr_verification_code)
      VALUES (?, ?, ?, ?, 'REGISTERED', ?, NULL, ?)
    `).run(registrationId, tenantId, examId, user.id, hallTicketNumber, qrCode);
    logAuditEvent(tenantId, user.id, 'EXAM_REGISTER', 'EXAM', examId,
      req.socket?.remoteAddress, { hallTicketNumber });
    json(res, 201, { success: true, registrationId, hallTicketNumber, seatAllotment: null, qrCode });
    return true;
  }

  if (pathname === '/api/academic/certificates' && req.method === 'GET') {
    if (!user) { json(res, 401, { error: 'UNAUTHORIZED' }); return true; }
    const staff = ['UNIVERSITY_ADMIN', 'CAMPUS_ADMIN', 'PLATFORM_OWNER'].includes(user.role);
    const certificates = db.prepare(`
      SELECT id, tenant_id, user_id, certificate_type, title, issue_date,
        cryptographic_hash, pdf_url, metadata_json, created_at
      FROM digital_certificates
      WHERE tenant_id = ? AND (? = 1 OR user_id = ?)
      ORDER BY issue_date DESC
    `).all(tenantId, staff ? 1 : 0, user.id);
    json(res, 200, { certificates });
    return true;
  }

  if (pathname === '/api/academic/calendar' && req.method === 'GET') {
    const calendar = db.prepare('SELECT * FROM academic_calendar WHERE tenant_id = ? ORDER BY start_date ASC').all(tenantId);
    json(res, 200, { calendar });
    return true;
  }

  if (pathname === '/api/academic/faculty-evaluation' && req.method === 'POST') {
    if (user?.role !== 'STUDENT') { json(res, user ? 403 : 401, { error: user ? 'STUDENT_ONLY' : 'UNAUTHORIZED' }); return true; }
    const { facultyId, courseId, clarityRating, punctualityRating, engagementRating, feedbackText } = body;
    const ratings = [clarityRating, punctualityRating, engagementRating];
    if (typeof facultyId !== 'string' || typeof courseId !== 'string' ||
        !ratings.every((value) => Number.isInteger(value) && value >= 1 && value <= 5) ||
        typeof feedbackText !== 'string' || feedbackText.length > 2000) {
      json(res, 400, { error: 'INVALID_EVALUATION' });
      return true;
    }
    const course = db.prepare(`
      SELECT c.id FROM courses c
      WHERE c.id = ? AND c.tenant_id = ? AND EXISTS (
        SELECT 1 FROM course_enrollments ce WHERE ce.course_id = c.id
          AND ce.student_id = ? AND ce.tenant_id = c.tenant_id AND ce.status = 'ACTIVE'
      )
    `).get(courseId, tenantId, user.id);
    const faculty = db.prepare('SELECT id FROM users WHERE id = ? AND tenant_id = ? AND role = ?')
      .get(facultyId, tenantId, 'FACULTY');
    if (!course || !faculty) { json(res, 404, { error: 'COURSE_OR_FACULTY_NOT_FOUND' }); return true; }

    // The student's identity is intentionally not persisted in the evaluation row.
    const evaluationId = 'eval_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    db.prepare(`
      INSERT INTO faculty_evaluations
        (id, tenant_id, faculty_id, student_id, course_id, clarity_rating,
         punctuality_rating, engagement_rating, feedback_text)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
    `).run(evaluationId, tenantId, facultyId, courseId,
      clarityRating, punctualityRating, engagementRating, feedbackText.trim());
    json(res, 201, { success: true, evaluationId, message: 'Anonymous faculty evaluation submitted.' });
    return true;
  }

  return false;
}
