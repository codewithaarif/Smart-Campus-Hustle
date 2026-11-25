import crypto from 'node:crypto';
import db from '../db/connection.js';

const sendJson = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
};

export function handleCareerAlumniRoutes(req, res, pathname, body) {
  const tenantId = req.tenant?.id || '';
  const user = req.user;
  const userId = user?.id || '';

  if (pathname === '/api/placements/jobs' && req.method === 'GET') {
    const jobs = db.prepare(`
      SELECT j.id, j.tenant_id, j.company_id, j.title, j.job_type, j.ctc_lpa,
        j.eligible_departments, j.min_cgpa, j.max_backlogs, j.deadline,
        j.description, j.created_at, c.company_name, c.industry, c.website, c.tier,
        (SELECT ja.stage FROM job_applications ja
         WHERE ja.job_id = j.id AND ja.student_id = ? AND ja.tenant_id = j.tenant_id) AS application_stage
      FROM job_openings j
      JOIN placement_companies c ON c.id = j.company_id AND c.tenant_id = j.tenant_id
      WHERE j.tenant_id = ? AND date(j.deadline) >= date('now')
      ORDER BY j.deadline ASC, j.created_at DESC
    `).all(userId, tenantId);
    const companies = db.prepare(`
      SELECT id, tenant_id, company_name, industry, website, tier
      FROM placement_companies WHERE tenant_id = ? ORDER BY company_name
    `).all(tenantId);
    const resume = user?.role === 'STUDENT'
      ? db.prepare('SELECT student_id, tenant_id, skills, projects_json, certifications_json, summary, updated_at FROM student_resumes WHERE student_id = ? AND tenant_id = ?')
        .get(userId, tenantId)
      : null;
    const normalizedResume = resume ? {
      ...resume,
      projects: JSON.parse(resume.projects_json || '[]'),
      certifications: JSON.parse(resume.certifications_json || '[]')
    } : null;
    const myApplications = user?.role === 'STUDENT' ? db.prepare(`
      SELECT ja.id, ja.job_id, ja.stage, ja.interview_date, ja.applied_at,
        j.title AS job_title, j.ctc_lpa, c.company_name
      FROM job_applications ja
      JOIN job_openings j ON j.id = ja.job_id AND j.tenant_id = ja.tenant_id
      JOIN placement_companies c ON c.id = j.company_id AND c.tenant_id = ja.tenant_id
      WHERE ja.student_id = ? AND ja.tenant_id = ?
      ORDER BY ja.applied_at DESC
    `).all(userId, tenantId) : [];
    sendJson(res, 200, { jobs, companies, resume: normalizedResume, myApplications });
    return true;
  }

  if (pathname === '/api/placements/apply' && req.method === 'POST') {
    if (user?.role !== 'STUDENT') { sendJson(user ? 403 : 401, { error: user ? 'STUDENT_ONLY' : 'UNAUTHORIZED' }); return true; }
    const jobId = typeof body.jobId === 'string' ? body.jobId : '';
    if (!jobId) { sendJson(400, { error: 'INVALID_JOB_ID' }); return true; }
    const job = db.prepare(`
      SELECT j.id FROM job_openings j
      JOIN placement_companies c ON c.id = j.company_id AND c.tenant_id = j.tenant_id
      WHERE j.id = ? AND j.tenant_id = ? AND date(j.deadline) >= date('now')
    `).get(jobId, tenantId);
    if (!job) { sendJson(404, { error: 'JOB_CLOSED_OR_NOT_FOUND' }); return true; }
    const existing = db.prepare('SELECT id, stage FROM job_applications WHERE job_id = ? AND student_id = ? AND tenant_id = ?')
      .get(jobId, userId, tenantId);
    if (existing) { sendJson(409, { error: 'ALREADY_APPLIED', applicationId: existing.id, stage: existing.stage }); return true; }
    const resume = db.prepare('SELECT student_id FROM student_resumes WHERE student_id = ? AND tenant_id = ?')
      .get(userId, tenantId);
    const applicationId = 'app_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    db.prepare(`
      INSERT INTO job_applications (id, tenant_id, job_id, student_id, resume_url, stage)
      VALUES (?, ?, ?, ?, NULL, 'APPLIED')
    `).run(applicationId, tenantId, jobId, userId);
    sendJson(res, 201, { success: true, applicationId, stage: 'APPLIED', resumeOnFile: Boolean(resume) });
    return true;
  }

  if (pathname === '/api/placements/resume' && req.method === 'POST') {
    if (user?.role !== 'STUDENT') { sendJson(user ? 403 : 401, { error: user ? 'STUDENT_ONLY' : 'UNAUTHORIZED' }); return true; }
    const skills = typeof body.skills === 'string' ? body.skills.trim() : '';
    const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
    const projects = Array.isArray(body.projects) ? body.projects : [];
    const certifications = Array.isArray(body.certifications) ? body.certifications : [];
    const validList = (items) => items.length <= 30 && items.every((item) =>
      typeof item === 'string' && item.trim().length > 0 && item.length <= 300);
    if (!skills || skills.length > 3000 || summary.length > 3000 ||
        !validList(projects) || !validList(certifications)) {
      sendJson(400, { error: 'INVALID_RESUME_PROFILE' });
      return true;
    }
    db.prepare(`
      INSERT INTO student_resumes
        (student_id, tenant_id, skills, projects_json, certifications_json, summary, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        skills = excluded.skills,
        projects_json = excluded.projects_json,
        certifications_json = excluded.certifications_json,
        summary = excluded.summary,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, tenantId, skills, JSON.stringify(projects), JSON.stringify(certifications), summary);
    sendJson(res, 200, { success: true, message: 'Career profile saved.' });
    return true;
  }

  if (pathname === '/api/alumni' && req.method === 'GET') {
    const alumni = db.prepare(`
      SELECT a.id, a.tenant_id, a.graduation_year, a.degree, a.current_company,
        a.designation AS current_position, a.linkedin_url, u.name, u.photo_url, u.department
      FROM alumni_profiles a
      JOIN users u ON a.user_id = u.id AND u.tenant_id = a.tenant_id
      WHERE a.tenant_id = ?
      ORDER BY a.graduation_year DESC
    `).all(tenantId);
    const donations = db.prepare(`
      SELECT alumni_id, COUNT(*) AS contribution_count, SUM(amount) AS total_amount
      FROM alumni_donations
      WHERE tenant_id = ?
      GROUP BY alumni_id
    `).all(tenantId);
    sendJson(res, 200, { alumni, donations });
    return true;
  }

  if (pathname === '/api/alumni/mentorship' && req.method === 'POST') {
    if (user?.role !== 'STUDENT') { sendJson(user ? 403 : 401, { error: user ? 'STUDENT_ONLY' : 'UNAUTHORIZED' }); return true; }
    const alumniId = typeof body.alumniId === 'string' ? body.alumniId : '';
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!alumniId || topic.length < 3 || topic.length > 160 || message.length < 10 || message.length > 2000) {
      sendJson(400, { error: 'INVALID_MENTORSHIP_REQUEST' });
      return true;
    }
    const alumni = db.prepare('SELECT id FROM alumni_profiles WHERE id = ? AND tenant_id = ?')
      .get(alumniId, tenantId);
    if (!alumni) { sendJson(404, { error: 'ALUMNI_NOT_FOUND' }); return true; }
    const pending = db.prepare(`
      SELECT id FROM alumni_mentorship_requests
      WHERE alumni_id = ? AND student_id = ? AND tenant_id = ? AND status = 'PENDING'
    `).get(alumniId, userId, tenantId);
    if (pending) { sendJson(409, { error: 'REQUEST_ALREADY_PENDING', requestId: pending.id }); return true; }

    const requestId = 'ment_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14);
    db.prepare(`
      INSERT INTO alumni_mentorship_requests
        (id, tenant_id, alumni_id, student_id, topic, message, status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(requestId, tenantId, alumniId, userId, topic, message);
    sendJson(res, 201, { success: true, requestId, status: 'PENDING' });
    return true;
  }

  return false;
}
