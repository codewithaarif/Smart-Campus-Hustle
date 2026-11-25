# Smart Campus Hustle — Integrated Campus Management Platform

This is a full-stack laboratory project for Mewar University. The implemented frontend and backend are demonstrated in this repository, while proposed technologies and modules in the lab workbook must not be reported as deployed features.

## Actual technology stack

- Frontend: React 18, TypeScript 5, Vite 6
- Backend: Node.js HTTP server with modular route handlers
- Database: SQLite via Node.js `node:sqlite`
- Authentication: password verification and signed bearer tokens
- Isolation: tenant and campus identifiers in API middleware and database queries
- Security: role checks, audit logs, HMAC-SHA256 dynamic QR verification
- PWA shell: Web manifest and service worker

The following were proposed in the lab workbook but are **not** implemented here: Express, PostgreSQL, Prisma, Redis/BullMQ, Socket.IO, cloud object storage and a production payment gateway.

## Run locally

Use Node.js 22.9 or newer (the backend uses the built-in `node:sqlite` module). The app must be served through Vite and the API; opening `index.html` as a local file is not supported.

```bash
npm install
cp .env.example .env
```

Open two terminals in the repository:

Terminal 1 — API server:

```bash
npm run server
```

Terminal 2 — frontend:

```bash
npm run dev -- --host 0.0.0.0
```

Open http://localhost:3000/. The Vite development server proxies `/api` requests to http://localhost:5050.

A new development database is created at `server/data/smart_campus.db` unless `DATABASE_PATH` is set. Development seeding creates sample accounts with the password `password123`; these accounts are for local testing only. Production never seeds sample accounts by default.

## Configuration and production readiness

- Copy `.env.example` and set independent `JWT_SECRET`, `QR_SECRET`, and `EMERGENCY_OVERRIDE_PIN` values before production startup. Production startup fails when signing secrets are missing or too short.
- `PAYMENTS_MODE=mock` is for local development only. Production requires `PAYMENTS_MODE=razorpay`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`. The server derives fee amounts from the ledger and verifies gateway signatures and captured payment details.
- Set `CORS_ALLOWED_ORIGINS` to the exact frontend origin(s) when the API is hosted separately. Set `TRUST_PROXY=true` only behind a proxy that you control.
- SQLite files, WAL sidecars, build output, dependencies, and environment files are excluded from Git. Back up the runtime database separately.
- The service worker caches the public app shell only. It never caches authenticated API responses. Offline synchronization currently supports maintenance drafts; other queued action types are retained and reported as unsupported.
- QR verification is short-lived and single-use. It does not connect to or actuate a physical gate controller. GPS updates are simulated only when explicitly enabled; real vehicle telemetry needs a device integration.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

---

## 🏛️ Multi-Tenant Architecture & Database Model

- **Tenant boundary**: Authenticated users are bound to their tenant; changing `X-Tenant-ID` or the tenant query parameter cannot switch a normal user into another institution. Tenant scoping is enforced in route queries, with additional composite tenant foreign keys still recommended.
- **Tenant Middleware**: Resolves the selected tenant and rejects cross-tenant requests for non-platform users. Exact tenant selection must accompany login.
- **Database Engine**: Relational SQLite ACID engine (`node:sqlite`) with WAL mode, foreign keys, and tenant-scoped indexes.
- **Security**: Salted scrypt password hashes (legacy hashes upgrade at login), signed and revocable sessions, TOTP verification for accounts with configured secrets, role checks on sensitive operations, audit events, and short-lived single-use HMAC QR credentials. A full role-permission matrix remains a deployment task.

## 🏛️ Mewar University Directory

The **Mewar University Directory** sidebar page includes the supplied university profile, department list, programme catalogue, and searchable/paginated faculty and published-leadership directory. The profile, departments, programmes, and names are imported from user-provided material; programme offerings and directory entries remain marked **Pending verification** and must not be treated as confirmation of current university records.

The imported directory intentionally contains no fabricated faculty contact details or student identities. A signed-in university admin can verify a pending faculty entry; each approval is tenant-scoped and written to the audit log.

Authenticated API:

- `GET /api/university/catalog?q=<text>&departmentId=<id>&section=FACULTY|PUBLISHED_LEADERSHIP&status=ALL|PENDING_VERIFICATION|VERIFIED|INACTIVE&page=1&limit=25` — returns the tenant profile, departments, programmes, faculty page, and verification counts.
- `POST /api/university/faculty/verify` with `{ "facultyId": "<directory-record-id>" }` — university-admin-only approval for a pending faculty record.
- `GET /api/university/students/roster?q=<text>&page=1&limit=25` — university-admin-only, tenant-scoped view of the authorized name-only roster. Imported entries are `INCOMPLETE`; no student accounts, university IDs, enrollment details, or contact details are created.
- `GET /api/university/students/profiles?q=<text>&page=1&limit=25` — university-admin-only searchable student profiles (enrollment number, roll number, name, course details, room, and supplied verification status). Reads are audit logged; these profile rows are not login accounts.

To import an authorized tab-separated student register into the local SQLite database, use:

```bash
node server/db/mewarStudentProfiles.js --file "/path/to/student-register.tsv" --tenant tenant_apex
```

The importer validates the five-column header and unique `MUR` enrollment numbers, accepts blank or repeated roll numbers, and safely upserts by tenant and enrollment number. The register is not bundled into source code. The supplied records were designated verified by the authorized user; this is not independent confirmation by the university.

---

## 📦 The 22 Integrated Modules

| # | Module | Key Features & Implementation |
|---|---|---|
| **1** | **Academic Management** | Course & syllabus registry, digital timetable matrix, assignments, online exams, hall tickets with seat allotment, cryptographic certificates, academic calendar, anonymous faculty feedback. |
| **2** | **Learning Management (LMS)** | Courseware materials (PDF/slides), streaming video lecture links, submission grading rubrics, online quiz engine with instant feedback, deadline notifications. |
| **3** | **Visitor Management** | Online pre-registration, government ID verification (Aadhaar/Passport/DL), host approval workflow, dynamic QR visitor passes, zone access restriction, gate turnstile logs. |
| **4** | **Emergency & Safety Management** | 1-Tap SOS Dispatcher with live geo-location, 24/7 campus emergency directory, medical & security incident reporting, campus broadcasts. |
| **5** | **Maintenance Management** | Work order tickets, photograph attachments, automated category-to-department routing, maintenance staff dashboard, SLA countdown targets, student satisfaction ratings. |
| **6** | **Financial Management** | Semester/hostel/transport fee structure, Razorpay integration (test mode for dev), HMAC signature verification, tamper-proof digital receipts, scholarship applications, transaction history (zero raw card credentials stored). |
| **7** | **Digital Library** | Book catalogue, live search, reserve queue with priority positioning, loan/return tracking, due-date reminders, automated fines, e-book reader, library turnstile entry. |
| **8** | **Smart Transport** | Route management with sequential stops, fleet driver roster, student seat allocation, real-time GPS telematics simulator (lat/lng/speed updates via SSE), parent arrival notifications. |
| **9** | **AI Student Assistant** | Contextual chatbot grounded in institutional rules, explains attendance calculations, leave procedures (OD/Medical), examination deadlines, timetable schedules, with strict privacy barriers protecting confidential records. |
| **10** | **AI Analytics & Student Success** | Attendance drift detection, CGPA trends, early warning support alerts, assignment completion rate, non-punitive personalized study recommendations with explainable factors. |
| **11** | **Placement & Career Management** | Corporate openings, tier classification, student job applications, interview scheduling, interactive student resume builder, placement statistics. |
| **12** | **Events & Student Activities** | Student clubs directory, event creation with Dean approval, event registration, dynamic QR tickets, check-in scanner, participation certificates. |
| **13** | **Cafeteria & Mess Management** | Digital menu with dietary tags (Veg/Non-Veg/Vegan) and calorie counts, online order cart, kitchen pickup token generator, monthly mess subscription plans, meal attendance. |
| **14** | **Resource Booking** | Lab, classroom, and seminar hall scheduler with double-booking collision prevention, amenity list, faculty approval workflow. |
| **15** | **Alumni Management** | Verified alumni directory, mentorship request pipeline, graduate career referrals, alumni donations & institutional endowments. |
| **16** | **Lost & Found** | Visual property bulletin, photo attachments, category filters, security custody signoff, ownership claim verification. |
| **17** | **Digital Identity** | Central University ID Card, dynamic cryptographic QR code (HMAC-SHA256 regenerating every 60 seconds with anti-screenshot protection), lost card deactivation toggle, digital degree verification. |
| **18** | **Grievance & Feedback** | Student grievances, hostel complaints, confidential & strictly anonymous reporting, zero-tolerance anti-ragging emergency priority, 72-hour auto-escalation tracking. |
| **19** | **Multi-Campus SaaS Architecture** | Multi-institution onboarding (e.g. Apex National University vs. Metropolitan Institute of Technology), satellite campuses, plan tiers (Basic, Pro, Enterprise), customizable academic policies (min attendance, late fees). |
| **20** | **Mobile & Offline Experience (PWA)** | Installable PWA with Service Worker, offline cached timetables & IDs, background sync queue, and strict gate pass security enforcement (offline cached tokens cannot open turnstiles without live verification or dual-officer emergency override). |
| **21** | **Administrative Automation** | Configurable trigger-action workflow builder, SLA escalation rules, automated document generation (Bonafide certificates, No-Dues clearance letters, Transcripts), CSV/JSON audit export. |
| **22** | **Security & Data Governance** | Fine-grained RBAC matrix, tenant isolation guarantees, sensitive data access audit logs with mandatory justifications, TOTP MFA, 7-year data retention compliance, API rate limiting. |

---

## 🔒 Gate Pass Security & Offline Outage Protocol (Module 20)

> [!IMPORTANT]
> **Mandatory Security Rule**: Offline cached permission tokens are **never** treated as valid proof of a gate pass. All gate turnstiles must verify cryptographic passes directly against the server when connectivity is available.
> If a total network or power outage occurs, turnstiles enforce a controlled emergency override requiring **dual-officer credentials** (Officer ID + Dual Witness ID + Emergency Master Override PIN), generating an immutable audit record.

---

## 🚀 Quickstart & Running the Application

### Prerequisites
- Node.js v20+ (uses native `node:sqlite` and `node:test`)
- npm

### Installation & Build
```bash
# Navigate to project directory
cd /Users/aarif/.gemini/antigravity/scratch/smart-campus

# Run automated test suite
npm test

# Build production bundle with Vite
npm run build

# Start Unified Multi-Tenant Cloud Server (Serves API + PWA on port 5050)
npm start
```

### Dev Mode
```bash
# Terminal 1: Backend API Server
npm run server

# Terminal 2: Vite Dev Server
npm run dev
```

---

## 👥 Demo Personas & Quick Role Switcher

Use the top-right persona switcher to instantly test different roles without re-authenticating:

1. **Student (Aarav Patel)**: `aarav.patel@student.apex.edu.in` — Enrolled in CS201/CS301/AI402, 96.4% attendance, all dues cleared.
2. **Student with Shortage Alert (Ananya Sengupta)**: `ananya.s@student.apex.edu.in` — CS201 attendance at 71.8% (below 75% limit), early warning recommendation triggered.
3. **Faculty (Prof. Arvind Namboodiri)**: `arvind.n@apex.edu.in` — Computer Science & Engineering HOD, marks attendance, grades assignments.
4. **Dean / University Admin (Dr. Radhika Sharma)**: `dean@apex.edu.in` — Apex University Admin, academic policies, event approvals.
5. **Security Guard (Havildar Gurpreet Singh)**: `security.gate1@apex.edu.in` — Turnstile scanner, visitor passes, emergency outage override.
6. **Maintenance Staff (Manoj Kumar)**: `facilities.tech@apex.edu.in` — Facilities & electrical technician, SLA resolutions.
7. **Librarian (Dr. Sumita Das)**: `library@apex.edu.in` — Book loans, reservation queue, turnstile entry.
8. **Platform Owner (Vikramaditya Roy)**: `owner@smartcampus.cloud` — SaaS SuperAdmin, multi-tenant subscription tiers.
9. **Metro Tech University Admin (Prof. K. Venkatesh)**: `provost@metro.edu.in` — Metropolitan Institute of Technology tenant partition.

*Default test password for all accounts: `password123`*

---

## 🧪 Automated Test Suite

Run the full automated test suite anytime with:
```bash
npm test
```
Validates:
- Multi-tenant query isolation
- JWT generation and RBAC verification
- 1-Tap SOS Dispatch record creation
- Razorpay test mode payment verification and digital receipt issuance
- Library reservation and book loans
- Smart transport vehicle telematics
- AI assistant confidentiality boundaries & academic rules
- 60-second dynamic cryptographic QR generation & HMAC signature verification
- Workflow trigger-action execution
- Anti-tamper dynamic QR rejection
- Dual-officer emergency gate pass outage override
- Sensitive data access audit logging
