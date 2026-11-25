-- SMART CAMPUS ENTERPRISE MULTI-TENANT RELATIONAL SCHEMA
-- Fully Normalized, Foreign-Key Enforced, Multi-University Architecture

PRAGMA foreign_keys = ON;

-- ============================================================================
-- MODULE 19: MULTI-CAMPUS SAAS ARCHITECTURE & TENANT ISOLATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    domain TEXT UNIQUE,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#0069c7',
    secondary_color TEXT DEFAULT '#0c87eb',
    subscription_plan TEXT DEFAULT 'ENTERPRISE', -- BASIC, PRO, ENTERPRISE
    subscription_status TEXT DEFAULT 'ACTIVE', -- ACTIVE, TRIAL, SUSPENDED
    max_campuses INTEGER DEFAULT 5,
    max_students INTEGER DEFAULT 25000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campuses (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_policies (
    tenant_id TEXT PRIMARY KEY,
    min_attendance_pct REAL DEFAULT 75.0,
    passing_grade_pct REAL DEFAULT 40.0,
    late_fee_per_day REAL DEFAULT 50.0,
    mfa_required_for_staff INTEGER DEFAULT 1,
    gate_pass_require_host_approval INTEGER DEFAULT 1,
    ai_features_enabled INTEGER DEFAULT 1,
    razorpay_enabled INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 22: SECURITY, DATA GOVERNANCE & CORE USERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT,
    university_id TEXT UNIQUE NOT NULL, -- e.g. APEX-2024-CS-0101
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL, -- PLATFORM_OWNER, UNIVERSITY_ADMIN, CAMPUS_ADMIN, FACULTY, STUDENT, PARENT, MAINTENANCE_STAFF, SECURITY_GUARD, LIBRARIAN, TRANSPORT_COORDINATOR, CAFETERIA_STAFF
    department TEXT,
    phone TEXT,
    photo_url TEXT,
    card_status TEXT DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, DEACTIVATED
    mfa_enabled INTEGER DEFAULT 0,
    mfa_secret TEXT,
    parent_id TEXT, -- Linked parent if student
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at DATETIME NOT NULL,
    revoked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL, -- LOGIN, UPDATE_GRADE, EXAM_REGISTER, SOS_TRIGGER, etc.
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    ip_address TEXT,
    details TEXT, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensitive_access_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    accessed_by_user_id TEXT NOT NULL,
    target_student_id TEXT NOT NULL,
    record_category TEXT NOT NULL, -- MEDICAL, COUNSELLING, DISCIPLINARY, FINANCIAL
    justification TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accessed_by_user_id) REFERENCES users(id),
    FOREIGN KEY (target_student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_consents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    consent_type TEXT NOT NULL, -- TERMS, PRIVACY, BIOMETRIC, GPS_TRACKING
    version TEXT NOT NULL,
    granted INTEGER DEFAULT 1,
    ip_address TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 1 & 2: ACADEMIC MANAGEMENT & LMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL, -- e.g. CS101
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    credits INTEGER DEFAULT 3,
    semester INTEGER DEFAULT 1,
    syllabus_outline TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS course_enrollments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, DROPPED, COMPLETED
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS timetables (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    faculty_id TEXT NOT NULL,
    day_of_week TEXT NOT NULL, -- Monday, Tuesday, ...
    start_time TEXT NOT NULL, -- '09:00'
    end_time TEXT NOT NULL,   -- '10:00'
    room_number TEXT NOT NULL,
    batch_section TEXT DEFAULT 'A',
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    timetable_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    status TEXT NOT NULL, -- PRESENT, ABSENT, LATE, EXCUSED
    marked_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    faculty_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    max_marks INTEGER DEFAULT 100,
    due_date DATETIME NOT NULL,
    attachment_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    assignment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    content_text TEXT,
    attachment_url TEXT,
    marks_obtained REAL,
    feedback TEXT,
    graded_by TEXT,
    graded_at DATETIME,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lms_materials (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    title TEXT NOT NULL,
    material_type TEXT NOT NULL, -- PDF, VIDEO, SLIDES, LINK, DOC
    file_url TEXT NOT NULL,
    file_size_kb INTEGER DEFAULT 1024,
    description TEXT,
    uploaded_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quizzes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    title TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    total_marks INTEGER DEFAULT 20,
    starts_at DATETIME,
    ends_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    options_json TEXT NOT NULL, -- JSON array of strings
    correct_option_index INTEGER NOT NULL,
    points INTEGER DEFAULT 1,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    quiz_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    score REAL DEFAULT 0,
    answers_json TEXT,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exam_schedules (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    exam_name TEXT NOT NULL, -- Mid-Term 2026, End-Semester Fall 2026
    exam_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    hall_number TEXT NOT NULL,
    registration_deadline DATETIME,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exam_registrations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    exam_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    registration_status TEXT DEFAULT 'REGISTERED', -- REGISTERED, CANCELLED
    hall_ticket_number TEXT UNIQUE,
    seat_allotment TEXT,
    qr_verification_code TEXT,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exam_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS internal_marks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    assessment_name TEXT NOT NULL, -- Internal 1, Assignment Component, Lab Practical
    max_marks REAL NOT NULL,
    marks_obtained REAL NOT NULL,
    evaluated_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS academic_calendar (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL, -- HOLIDAY, EXAM_WEEK, SEMESTER_START, SPORTS_MEET, CONVOCATION
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS faculty_evaluations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    faculty_id TEXT NOT NULL,
    student_id TEXT, -- Can be NULL for strictly anonymous
    course_id TEXT NOT NULL,
    clarity_rating INTEGER CHECK (clarity_rating BETWEEN 1 AND 5),
    punctuality_rating INTEGER CHECK (punctuality_rating BETWEEN 1 AND 5),
    engagement_rating INTEGER CHECK (engagement_rating BETWEEN 1 AND 5),
    feedback_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS digital_certificates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    certificate_type TEXT NOT NULL, -- DEGREE, MERIT, WORKSHOP, COURSE_COMPLETION
    title TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    cryptographic_hash TEXT UNIQUE NOT NULL,
    pdf_url TEXT,
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 3: VISITOR MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS visitor_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    visitor_name TEXT NOT NULL,
    visitor_phone TEXT NOT NULL,
    visitor_email TEXT,
    id_proof_type TEXT NOT NULL, -- AADHAAR, PASSPORT, DRIVERS_LICENSE
    id_proof_number TEXT NOT NULL,
    host_user_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expected_arrival DATETIME NOT NULL,
    host_approval_status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    pass_qr_code TEXT UNIQUE,
    allowed_zones TEXT DEFAULT 'ACADEMIC_BLOCK,VISITOR_LOUNGE',
    check_in_time DATETIME,
    check_out_time DATETIME,
    security_officer_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 4: EMERGENCY & SAFETY MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS sos_alerts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    triggered_by_user_id TEXT NOT NULL,
    alert_type TEXT DEFAULT 'GENERAL_SOS', -- GENERAL_SOS, MEDICAL, HARASSMENT, FIRE
    location_description TEXT NOT NULL,
    gps_coordinates TEXT, -- "lat,lng"
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, ACKNOWLEDGED, RESOLVED, FALSE_ALARM
    dispatched_officers TEXT,
    resolved_at DATETIME,
    resolution_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (triggered_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_notifications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    recipient_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'INFO',
    source_id TEXT,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient
ON user_notifications (tenant_id, recipient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS university_profiles (
    tenant_id TEXT PRIMARY KEY,
    university_type TEXT NOT NULL,
    established_year INTEGER,
    location TEXT NOT NULL,
    district TEXT,
    state TEXT,
    country TEXT,
    postal_code TEXT,
    region TEXT,
    academic_session TEXT,
    official_website TEXT,
    admissions_website TEXT,
    student_portal TEXT,
    admissions_helpline TEXT,
    admissions_email TEXT,
    source_note TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS university_departments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, name),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS university_programmes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    department_id TEXT,
    name TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, department_id, name),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES university_departments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS faculty_directory (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    department_id TEXT,
    full_name TEXT NOT NULL,
    directory_section TEXT NOT NULL DEFAULT 'FACULTY',
    verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    verified_by_user_id TEXT,
    verified_at DATETIME,
    source_note TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, department_id, full_name, directory_section),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES university_departments(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_university_departments_tenant
ON university_departments (tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_university_programmes_tenant_department
ON university_programmes (tenant_id, department_id, name);

CREATE INDEX IF NOT EXISTS idx_faculty_directory_tenant_department_status
ON faculty_directory (tenant_id, department_id, verification_status, full_name);

CREATE TABLE IF NOT EXISTS student_roster_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    record_status TEXT NOT NULL DEFAULT 'INCOMPLETE',
    source_note TEXT NOT NULL,
    import_batch TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, import_batch, id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_roster_tenant_name
ON student_roster_records (tenant_id, full_name);

CREATE TABLE IF NOT EXISTS student_profiles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    enrollment_number TEXT NOT NULL,
    roll_number TEXT,
    full_name TEXT NOT NULL,
    course_details TEXT NOT NULL,
    room_number TEXT,
    verification_status TEXT NOT NULL DEFAULT 'VERIFIED',
    verification_note TEXT NOT NULL,
    import_batch TEXT NOT NULL,
    verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, enrollment_number),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_tenant_name
ON student_profiles (tenant_id, full_name);

CREATE INDEX IF NOT EXISTS idx_student_profiles_tenant_roll
ON student_profiles (tenant_id, roll_number);

CREATE TABLE IF NOT EXISTS emergency_contacts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    service_name TEXT NOT NULL, -- Campus Police, 24/7 Medical Clinic, Chief Proctor, Ambulance
    phone_number TEXT NOT NULL,
    email TEXT,
    operating_hours TEXT DEFAULT '24/7',
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emergency_broadcasts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'WARNING', -- CRITICAL, WARNING, ADVISORY
    sent_by TEXT NOT NULL,
    channels TEXT DEFAULT 'IN_APP,SMS,EMAIL',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS security_incidents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    incident_type TEXT NOT NULL, -- THEFT, TRESPASSING, FIGHT, CYBER, MEDICAL
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'INVESTIGATING', -- REPORTED, INVESTIGATING, RESOLVED, CLOSED
    resolution_report TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 5: MAINTENANCE MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_tickets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    reported_by_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL, -- ELECTRICAL, PLUMBING, HVAC, IT_HARDWARE, CARPENTRY, CIVIL
    location TEXT NOT NULL, -- e.g. Hostel B, Room 304
    photo_url TEXT,
    priority TEXT DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, URGENT
    status TEXT DEFAULT 'OPEN', -- OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED
    assigned_department TEXT,
    assigned_technician_id TEXT,
    sla_due_hours INTEGER DEFAULT 48,
    resolved_at DATETIME,
    resolution_notes TEXT,
    student_rating INTEGER CHECK (student_rating BETWEEN 1 AND 5),
    student_feedback TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 6: FINANCIAL MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS fee_structures (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    course_id TEXT,
    fee_type TEXT NOT NULL, -- SEMESTER_TUITION, HOSTEL, TRANSPORT, LAB, EXAMINATION
    amount REAL NOT NULL,
    due_date TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_fee_dues (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    fee_structure_id TEXT NOT NULL,
    total_amount REAL NOT NULL,
    amount_paid REAL DEFAULT 0,
    balance_amount REAL NOT NULL,
    status TEXT DEFAULT 'UNPAID', -- UNPAID, PARTIAL, PAID
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (fee_structure_id) REFERENCES fee_structures(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    fee_due_id TEXT,
    razorpay_order_id TEXT NOT NULL,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'INR',
    payment_mode TEXT DEFAULT 'RAZORPAY_TEST', -- UPI, CARD_TOKENIZED, NETBANKING
    status TEXT DEFAULT 'PENDING', -- PENDING, SUCCESS, FAILED, REFUNDED
    receipt_number TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scholarships (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    criteria TEXT,
    application_deadline TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scholarship_applications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    scholarship_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    gpa REAL,
    annual_income REAL,
    statement_of_purpose TEXT,
    status TEXT DEFAULT 'SUBMITTED', -- SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED
    disbursed_amount REAL DEFAULT 0,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scholarship_id) REFERENCES scholarships(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS refund_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    payment_transaction_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, PROCESSED
    processed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_transaction_id) REFERENCES payment_transactions(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 7: DIGITAL LIBRARY
-- ============================================================================

CREATE TABLE IF NOT EXISTS library_books (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    isbn TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    category TEXT NOT NULL,
    total_copies INTEGER DEFAULT 1,
    available_copies INTEGER DEFAULT 1,
    shelf_location TEXT NOT NULL,
    is_ebook INTEGER DEFAULT 0,
    ebook_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS book_reservations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reservation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'WAITING', -- WAITING, ALLOTTED, EXPIRED, CANCELLED
    queue_number INTEGER DEFAULT 1,
    FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS book_issues (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    return_date TEXT,
    fine_amount REAL DEFAULT 0,
    fine_paid INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ISSUED', -- ISSUED, RETURNED, OVERDUE
    FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS library_gate_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    entry_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    allocated_seat TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 8: SMART TRANSPORT
-- ============================================================================

CREATE TABLE IF NOT EXISTS transport_routes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    route_name TEXT NOT NULL,
    start_point TEXT NOT NULL,
    end_point TEXT NOT NULL,
    stops_json TEXT NOT NULL, -- JSON array: [{"name": "Central Circle", "eta": "07:30"}, ...]
    monthly_fee REAL DEFAULT 1500.0,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transport_vehicles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    route_id TEXT,
    bus_number TEXT NOT NULL,
    license_plate TEXT UNIQUE NOT NULL,
    seating_capacity INTEGER DEFAULT 45,
    driver_name TEXT NOT NULL,
    driver_phone TEXT NOT NULL,
    current_lat REAL DEFAULT 12.9716,
    current_lng REAL DEFAULT 77.5946,
    speed_kmh REAL DEFAULT 35.0,
    next_stop TEXT,
    eta_minutes INTEGER DEFAULT 8,
    last_ping DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES transport_routes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS transport_allocations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    vehicle_id TEXT,
    pickup_stop TEXT NOT NULL,
    seat_number TEXT,
    status TEXT DEFAULT 'ACTIVE',
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES transport_routes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bus_attendance (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    board_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 9 & 10: AI STUDENT ASSISTANT & SUCCESS ANALYTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_title TEXT DEFAULT 'Academic Support Session',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender TEXT NOT NULL, -- 'user' or 'ai'
    message_text TEXT NOT NULL,
    referenced_context TEXT, -- JSON summary of authorized data accessed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_success_metrics (
    student_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    attendance_rate REAL DEFAULT 85.0,
    gpa REAL DEFAULT 3.6,
    assignment_completion_rate REAL DEFAULT 90.0,
    risk_level TEXT DEFAULT 'LOW', -- LOW, MODERATE, HIGH
    explainable_risk_factors TEXT, -- JSON array of reasoning
    support_recommendations TEXT,  -- JSON recommendations
    last_evaluated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 11: PLACEMENT & CAREER MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS placement_companies (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    company_name TEXT NOT NULL,
    industry TEXT NOT NULL,
    website TEXT,
    tier TEXT DEFAULT 'TIER_1', -- TIER_1, TIER_2, DREAM
    verified INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_openings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    title TEXT NOT NULL,
    job_type TEXT DEFAULT 'FULL_TIME', -- FULL_TIME, INTERNSHIP
    ctc_lpa REAL NOT NULL,
    eligible_departments TEXT NOT NULL, -- CSV: CS, IT, EC
    min_cgpa REAL DEFAULT 7.0,
    max_backlogs INTEGER DEFAULT 0,
    deadline TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES placement_companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_applications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    resume_url TEXT,
    stage TEXT DEFAULT 'APPLIED', -- APPLIED, SHORTLISTED, INTERVIEW_SCHEDULED, OFFERED, REJECTED
    interview_date DATETIME,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES job_openings(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_resumes (
    student_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    skills TEXT NOT NULL, -- CSV: React, Node, Python, SQL
    projects_json TEXT,
    certifications_json TEXT,
    summary TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 12: EVENTS & STUDENT ACTIVITIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_clubs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- TECH, CULTURAL, SPORTS, ROBOTICS, LITERARY
    lead_student_id TEXT,
    faculty_advisor_id TEXT,
    description TEXT,
    member_count INTEGER DEFAULT 1,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    club_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    venue TEXT NOT NULL,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    capacity INTEGER DEFAULT 200,
    registered_count INTEGER DEFAULT 0,
    requires_approval INTEGER DEFAULT 1,
    dean_approval_status TEXT DEFAULT 'APPROVED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (club_id) REFERENCES student_clubs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS event_registrations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    qr_ticket TEXT UNIQUE NOT NULL,
    attended INTEGER DEFAULT 0,
    certificate_issued INTEGER DEFAULT 0,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 13: CAFETERIA & MESS MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS cafeteria_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- BREAKFAST, LUNCH, SNACKS, BEVERAGES, DINNER
    dietary_type TEXT DEFAULT 'VEG', -- VEG, NON_VEG, VEGAN
    price REAL NOT NULL,
    calories INTEGER,
    available INTEGER DEFAULT 1,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cafeteria_orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    token_number INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    payment_status TEXT DEFAULT 'PAID',
    order_status TEXT DEFAULT 'READY', -- PREPARING, READY, PICKED_UP, CANCELLED
    items_json TEXT NOT NULL, -- JSON array of {item_id, name, qty, price}
    ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mess_subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    plan_name TEXT NOT NULL, -- 3-MEAL PLATINUM, LUNCH+DINNER STANDARD
    monthly_fee REAL NOT NULL,
    month_year TEXT NOT NULL, -- '2026-11'
    status TEXT DEFAULT 'ACTIVE',
    qr_pass TEXT UNIQUE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mess_attendance (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    meal_type TEXT NOT NULL, -- BREAKFAST, LUNCH, DINNER
    scan_date TEXT NOT NULL,
    scan_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 14: RESOURCE BOOKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS campus_resources (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    name TEXT NOT NULL,
    resource_type TEXT NOT NULL, -- LAB, CLASSROOM, SEMINAR_HALL, PROJECT_ROOM, EQUIPMENT
    capacity INTEGER DEFAULT 40,
    amenities TEXT, -- CSV: Projector, High-End GPUs, Smartboard, Mic
    requires_faculty_approval INTEGER DEFAULT 1,
    status TEXT DEFAULT 'AVAILABLE',
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resource_reservations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    requested_by_user_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    approval_status TEXT DEFAULT 'APPROVED', -- PENDING, APPROVED, REJECTED
    approved_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES campus_resources(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 15: ALUMNI MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS alumni_profiles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    graduation_year INTEGER NOT NULL,
    degree TEXT NOT NULL,
    current_company TEXT NOT NULL,
    designation TEXT NOT NULL,
    linkedin_url TEXT,
    available_for_mentorship INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alumni_mentorship_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    alumni_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'PENDING', -- PENDING, ACCEPTED, COMPLETED
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (alumni_id) REFERENCES alumni_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alumni_donations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    alumni_id TEXT NOT NULL,
    amount REAL NOT NULL,
    purpose TEXT NOT NULL, -- SCHOLARSHIP_FUND, LAB_INFRASTRUCTURE, ENDOWMENT
    receipt_number TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (alumni_id) REFERENCES alumni_profiles(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 16: LOST & FOUND
-- ============================================================================

CREATE TABLE IF NOT EXISTS lost_found_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    item_type TEXT NOT NULL, -- LOST, FOUND
    title TEXT NOT NULL,
    category TEXT NOT NULL, -- ELECTRONICS, WALLET_ID, BOOKS, ACCESSORIES, KEYS
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    photo_url TEXT,
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, CLAIMED, HANDED_OVER, CLOSED
    reported_by_user_id TEXT NOT NULL,
    claimed_by_user_id TEXT,
    security_verified_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 17: DIGITAL IDENTITY & SMART CARDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS dynamic_qr_tokens (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    token_seed TEXT NOT NULL,
    signature TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 18: GRIEVANCE & FEEDBACK
-- ============================================================================

CREATE TABLE IF NOT EXISTS grievances (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    campus_id TEXT NOT NULL,
    tracking_ticket_number TEXT UNIQUE NOT NULL, -- e.g. GRV-2026-8902
    category TEXT NOT NULL, -- ANTI_RAGGING, ACADEMIC_DISPUTE, HOSTEL_MESS, HARASSMENT, FACILITY
    confidentiality_level TEXT DEFAULT 'CONFIDENTIAL', -- PUBLIC, CONFIDENTIAL, STRICTLY_ANONYMOUS
    submitted_by_user_id TEXT, -- NULL for STRICTLY_ANONYMOUS
    subject TEXT NOT NULL,
    details TEXT NOT NULL,
    priority TEXT DEFAULT 'HIGH', -- NORMAL, HIGH, EMERGENCY_CRITICAL
    status TEXT DEFAULT 'IN_REVIEW', -- SUBMITTED, IN_REVIEW, COMMITTEE_ASSIGNED, RESOLVED, CLOSED
    auto_escalation_deadline DATETIME NOT NULL,
    is_escalated INTEGER DEFAULT 0,
    resolution_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 21: ADVANCED ADMINISTRATIVE AUTOMATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_workflows (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    trigger_event TEXT NOT NULL, -- ATTENDANCE_DROP_BELOW_75, FEE_OVERDUE_30_DAYS, GRIEVANCE_UNRESOLVED_48H, SOS_FIRED
    condition_json TEXT NOT NULL,
    action_type TEXT NOT NULL,   -- SEND_PARENT_SMS, ROUTE_TO_DEAN, ESCALATE_TICKET, GENERATE_NO_DUES_DOC
    action_payload_json TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_triggered_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS generated_documents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    doc_type TEXT NOT NULL, -- HALL_TICKET, TRANSCRIPT, NO_DUES_CLEARANCE, BONAFIDE_CERTIFICATE
    document_hash TEXT UNIQUE NOT NULL,
    download_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for lightning fast multi-tenant queries & isolation
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_univ_id ON users(university_id);
CREATE INDEX IF NOT EXISTS idx_timetables_course ON timetables(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dues_student ON student_fee_dues(student_id);
CREATE INDEX IF NOT EXISTS idx_grievances_tenant ON grievances(tenant_id);


-- One pending payment order per student fee due. This limits duplicate open
-- orders while leaving historical SUCCESS/FAILED transactions untouched.
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_pending_fee_order
ON payment_transactions (tenant_id, user_id, fee_due_id)
WHERE status = 'PENDING' AND fee_due_id IS NOT NULL;

-- Single-use nonce ledger for short-lived dynamic QR credentials.
CREATE TABLE IF NOT EXISTS used_qr_tokens (
    nonce TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_used_qr_tokens_expiry ON used_qr_tokens (expires_at);

-- Idempotency ledger for operations received from offline clients.
CREATE TABLE IF NOT EXISTS offline_sync_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    client_item_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, user_id, client_item_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_offline_sync_user
ON offline_sync_records (tenant_id, user_id, created_at DESC);
