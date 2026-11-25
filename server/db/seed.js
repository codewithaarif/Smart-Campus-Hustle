import { hashPassword } from '../security/passwords.js';
import db from './connection.js';
import { seedMewarCatalog } from './mewarCatalog.js';
import { seedMewarStudentRoster } from './mewarStudentRoster.js';

export function seedDatabase() {
  const existingTenants = db.prepare('SELECT count(*) as count FROM tenants').get().count;
  if (existingTenants > 0) {
    applyMewarDemoProfile();
    applyMewarDemoTimetable();
    applyMewarDemoExams();
    seedMewarCatalog(db);
    seedMewarStudentRoster(db);
    console.log('Database already contains records. Skipping seed.');
    return;
  }

  console.log('Seeding Smart Campus Multi-Tenant SaaS database...');


  // 1. TENANTS
  db.exec(`
    INSERT INTO tenants (id, name, slug, domain, logo_url, primary_color, secondary_color, subscription_plan, subscription_status) VALUES
    ('tenant_apex', 'Apex National University', 'apex-uni', 'apex.edu.in', 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=150', '#0069c7', '#0c87eb', 'ENTERPRISE', 'ACTIVE'),
    ('tenant_metro', 'Metropolitan Institute of Technology', 'metro-tech', 'metro.edu.in', 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=150', '#10b981', '#059669', 'PRO', 'ACTIVE');

    INSERT INTO campuses (id, tenant_id, name, code, address, city, contact_email, contact_phone) VALUES
    ('campus_apex_main', 'tenant_apex', 'Apex Tech Knowledge Park', 'APEX-MN', 'Sector 62, Innovation Valley', 'Bengaluru', 'campus.main@apex.edu.in', '+91 80 2345 6789'),
    ('campus_apex_north', 'tenant_apex', 'Apex North Satellite Campus', 'APEX-NO', 'Plot 4, Cyber Highway', 'Noida NCR', 'campus.north@apex.edu.in', '+91 120 456 7890'),
    ('campus_metro_main', 'tenant_metro', 'Metro Tech HITEC Campus', 'METRO-01', 'Gachibowli Tech Corridor', 'Hyderabad', 'admin@metro.edu.in', '+91 40 3344 5566');

    INSERT INTO tenant_policies (tenant_id, min_attendance_pct, passing_grade_pct, late_fee_per_day, mfa_required_for_staff, gate_pass_require_host_approval, ai_features_enabled, razorpay_enabled) VALUES
    ('tenant_apex', 75.0, 40.0, 50.0, 1, 1, 1, 1),
    ('tenant_metro', 70.0, 40.0, 100.0, 0, 1, 1, 1);
  `);

  // 2. USERS
  db.exec(`
    INSERT INTO users (id, tenant_id, campus_id, university_id, name, email, password_hash, role, department, phone, photo_url, card_status, mfa_enabled) VALUES
    ('user_owner', 'tenant_apex', 'campus_apex_main', 'GLOBAL-ROOT-001', 'Vikramaditya Roy (Platform Owner)', 'owner@smartcampus.cloud', '${hashPassword('password123')}', 'PLATFORM_OWNER', 'Executive HQ', '+91 98888 00000', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'ACTIVE', 0),
    ('user_admin_apex', 'tenant_apex', 'campus_apex_main', 'APEX-ADM-001', 'Dr. Radhika Sharma (Dean)', 'dean@apex.edu.in', '${hashPassword('password123')}', 'UNIVERSITY_ADMIN', 'Computer Science & Engineering', '+91 98111 22334', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', 'ACTIVE', 0),
    ('user_faculty_1', 'tenant_apex', 'campus_apex_main', 'APEX-FAC-104', 'Prof. Arvind Namboodiri', 'arvind.n@apex.edu.in', '${hashPassword('password123')}', 'FACULTY', 'Computer Science & Engineering', '+91 98222 33445', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'ACTIVE', 0),
    ('user_student_1', 'tenant_apex', 'campus_apex_main', 'MUR2600425', 'Md Aarif Hussain', 'aarav.patel@student.apex.edu.in', '${hashPassword('password123')}', 'STUDENT', 'Computer Science & Engineering', '+91 98333 44556', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150', 'ACTIVE', 0),
    ('user_student_2', 'tenant_apex', 'campus_apex_main', 'APEX-2024-CS-0850', 'Ananya Sengupta', 'ananya.s@student.apex.edu.in', '${hashPassword('password123')}', 'STUDENT', 'Computer Science & Engineering', '+91 98444 55667', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', 'ACTIVE', 0),
    ('user_parent_1', 'tenant_apex', 'campus_apex_main', 'APEX-PAR-901', 'Rajesh Patel', 'rajesh.patel@gmail.com', '${hashPassword('password123')}', 'PARENT', 'Guardian', '+91 98555 66778', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150', 'ACTIVE', 0),
    ('user_guard_1', 'tenant_apex', 'campus_apex_main', 'APEX-SEC-012', 'Havildar Gurpreet Singh', 'security.gate1@apex.edu.in', '${hashPassword('password123')}', 'SECURITY_GUARD', 'Campus Safety & Vigilance', '+91 98666 77889', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', 'ACTIVE', 0),
    ('user_maint_1', 'tenant_apex', 'campus_apex_main', 'APEX-MNT-045', 'Manoj Kumar (Electrical)', 'facilities.tech@apex.edu.in', '${hashPassword('password123')}', 'MAINTENANCE_STAFF', 'Facilities & Civil Services', '+91 98777 88990', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150', 'ACTIVE', 0),
    ('user_lib_1', 'tenant_apex', 'campus_apex_main', 'APEX-LIB-003', 'Dr. Sumita Das', 'library@apex.edu.in', '${hashPassword('password123')}', 'LIBRARIAN', 'Central University Library', '+91 98888 99001', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', 'ACTIVE', 0),
    ('user_trans_1', 'tenant_apex', 'campus_apex_main', 'APEX-TRN-008', 'Balwinder Singh (Route Lead)', 'transport@apex.edu.in', '${hashPassword('password123')}', 'TRANSPORT_COORDINATOR', 'Fleet Operations', '+91 98999 00112', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150', 'ACTIVE', 0),
    ('user_cafe_1', 'tenant_apex', 'campus_apex_main', 'APEX-CAF-002', 'Chef Ramesh Nair', 'cafeteria@apex.edu.in', '${hashPassword('password123')}', 'CAFETERIA_STAFF', 'Dining & Mess Services', '+91 98111 00223', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150', 'ACTIVE', 0),
    -- Metro Tech Tenant User
    ('user_admin_metro', 'tenant_metro', 'campus_metro_main', 'METRO-ADM-001', 'Prof. K. Venkatesh', 'provost@metro.edu.in', '${hashPassword('password123')}', 'UNIVERSITY_ADMIN', 'Information Technology', '+91 98222 11000', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150', 'ACTIVE', 0);

    UPDATE users SET parent_id = 'user_parent_1' WHERE id = 'user_student_1';
  `);
  applyMewarDemoProfile();

  // 3. ACADEMIC & LMS COURSES
  db.exec(`
    INSERT INTO courses (id, tenant_id, code, title, department, credits, semester, syllabus_outline) VALUES
    ('course_cs201', 'tenant_apex', 'CS201', 'Data Structures & Algorithms in Practice', 'Computer Science & Engineering', 4, 3, 'Arrays, Trees, Graphs, Dynamic Programming, Greedy Algorithms, Big-O complexity analysis.'),
    ('course_cs301', 'tenant_apex', 'CS301', 'Advanced Database Management Systems', 'Computer Science & Engineering', 3, 5, 'ACID transactions, Relational modeling, Query optimization, NoSQL systems, Multi-tenant indexing.'),
    ('course_ai402', 'tenant_apex', 'AI402', 'Applied Deep Learning & Generative AI', 'Computer Science & Engineering', 4, 7, 'Neural networks, Transformers, Attention mechanisms, Vector embeddings, Fine-tuning LLMs.');

    INSERT INTO course_enrollments (id, tenant_id, course_id, student_id, academic_year, status) VALUES
    ('enr_1', 'tenant_apex', 'course_cs201', 'user_student_1', '2026-2027', 'ACTIVE'),
    ('enr_2', 'tenant_apex', 'course_cs301', 'user_student_1', '2026-2027', 'ACTIVE'),
    ('enr_3', 'tenant_apex', 'course_ai402', 'user_student_1', '2026-2027', 'ACTIVE'),
    ('enr_4', 'tenant_apex', 'course_cs201', 'user_student_2', '2026-2027', 'ACTIVE');

    INSERT INTO timetables (id, tenant_id, campus_id, course_id, faculty_id, day_of_week, start_time, end_time, room_number, batch_section) VALUES
    ('tt_1', 'tenant_apex', 'campus_apex_main', 'course_cs201', 'user_faculty_1', 'Monday', '09:00', '10:30', 'Turing Hall 401', 'CS-A'),
    ('tt_2', 'tenant_apex', 'campus_apex_main', 'course_cs301', 'user_faculty_1', 'Monday', '11:00', '12:30', 'Lovelace Lab 202', 'CS-A'),
    ('tt_3', 'tenant_apex', 'campus_apex_main', 'course_ai402', 'user_faculty_1', 'Tuesday', '10:00', '11:30', 'Supercomputing Lab B', 'CS-A'),
    ('tt_4', 'tenant_apex', 'campus_apex_main', 'course_cs201', 'user_faculty_1', 'Wednesday', '09:00', '10:30', 'Turing Hall 401', 'CS-A'),
    ('tt_5', 'tenant_apex', 'campus_apex_main', 'course_cs301', 'user_faculty_1', 'Thursday', '14:00', '15:30', 'Lovelace Lab 202', 'CS-A'),
    ('tt_6', 'tenant_apex', 'campus_apex_main', 'course_ai402', 'user_faculty_1', 'Friday', '11:00', '12:30', 'Auditorium 1', 'CS-A');

    INSERT INTO attendance_records (id, tenant_id, timetable_id, course_id, student_id, date, status, marked_by) VALUES
    ('att_1', 'tenant_apex', 'tt_1', 'course_cs201', 'user_student_1', '2026-10-27', 'PRESENT', 'user_faculty_1'),
    ('att_2', 'tenant_apex', 'tt_2', 'course_cs301', 'user_student_1', '2026-10-27', 'PRESENT', 'user_faculty_1'),
    ('att_3', 'tenant_apex', 'tt_3', 'course_ai402', 'user_student_1', '2026-10-28', 'PRESENT', 'user_faculty_1'),
    ('att_4', 'tenant_apex', 'tt_4', 'course_cs201', 'user_student_1', '2026-10-29', 'PRESENT', 'user_faculty_1'),
    ('att_5', 'tenant_apex', 'tt_1', 'course_cs201', 'user_student_2', '2026-10-27', 'ABSENT', 'user_faculty_1');

    INSERT INTO assignments (id, tenant_id, course_id, faculty_id, title, description, max_marks, due_date, attachment_url) VALUES
    ('assign_1', 'tenant_apex', 'course_cs201', 'user_faculty_1', 'Implement Red-Black Tree in C++/Java', 'Build self-balancing binary search tree with rotate and balance operations.', 50, '2026-11-10 23:59:00', '/materials/assignments/rb_tree_spec.pdf'),
    ('assign_2', 'tenant_apex', 'course_cs301', 'user_faculty_1', 'Multi-Tenant Database Partitioning Benchmark', 'Write an analytical report on schema-per-tenant vs shared-schema with tenant_id.', 100, '2026-11-15 23:59:00', '/materials/assignments/db_tenancy.pdf');

    INSERT INTO assignment_submissions (id, tenant_id, assignment_id, student_id, content_text, attachment_url, marks_obtained, feedback, graded_by, graded_at) VALUES
    ('sub_1', 'tenant_apex', 'assign_1', 'user_student_1', 'Completed Red-Black Tree with 100% test pass rate including edge case deletion.', '/submissions/aarav_rb_tree.zip', 48.5, 'Outstanding implementation! Clean pointer management and memory freeing.', 'user_faculty_1', '2026-10-30 14:00:00');

    INSERT INTO lms_materials (id, tenant_id, course_id, title, material_type, file_url, file_size_kb, description, uploaded_by) VALUES
    ('mat_1', 'tenant_apex', 'course_cs201', 'Lecture 14: Graph Theory & Shortest Path Dijkstra', 'PDF', '/lms/cs201_lec14_graphs.pdf', 3420, 'Comprehensive lecture slides covering Dijkstra and Bellman-Ford.', 'Prof. Arvind Namboodiri'),
    ('mat_2', 'tenant_apex', 'course_cs201', 'Recorded Lecture: Binary Heaps & Priority Queues', 'VIDEO', 'https://streaming.apex.edu.in/vod/cs201-heaps.mp4', 128000, 'Live classroom stream recording with Q&A session.', 'Prof. Arvind Namboodiri'),
    ('mat_3', 'tenant_apex', 'course_ai402', 'Transformer Attention Mechanism Deep Dive', 'PDF', '/lms/ai402_attention.pdf', 5200, 'Mathematical equations and PyTorch code walkthrough for multi-head attention.', 'Prof. Arvind Namboodiri');

    INSERT INTO quizzes (id, tenant_id, course_id, title, duration_minutes, total_marks, starts_at, ends_at) VALUES
    ('quiz_1', 'tenant_apex', 'course_cs201', 'Mid-Term Quiz: Trees & Dynamic Programming', 20, 10, '2026-11-05 10:00:00', '2026-11-05 20:00:00');

    INSERT INTO quiz_questions (id, quiz_id, question_text, options_json, correct_option_index, points) VALUES
    ('qq_1', 'quiz_1', 'What is the worst-case lookup time complexity in a Red-Black Tree with N nodes?', '["O(1)", "O(log N)", "O(N)", "O(N log N)"]', 1, 2),
    ('qq_2', 'quiz_1', 'Which graph algorithm can handle negative edge weights?', '["Dijkstra", "Bellman-Ford", "Prim Algorithm", "Kruskal Algorithm"]', 1, 2),
    ('qq_3', 'quiz_1', 'What is the minimum height of an AVL tree with 15 nodes?', '["3", "4", "5", "6"]', 1, 2);

    INSERT INTO exam_schedules (id, tenant_id, campus_id, course_id, exam_name, exam_date, start_time, end_time, hall_number, registration_deadline) VALUES
    ('exam_1', 'tenant_apex', 'campus_apex_main', 'course_cs201', 'End-Semester Theory Exam Nov 2026', '2026-11-20', '09:30', '12:30', 'Exam Hall A-102', '2026-11-12 18:00:00'),
    ('exam_2', 'tenant_apex', 'campus_apex_main', 'course_cs301', 'End-Semester Practical Evaluation', '2026-11-23', '14:00', '17:00', 'Computer Lab 3', '2026-11-12 18:00:00');

    INSERT INTO exam_registrations (id, tenant_id, exam_id, student_id, registration_status, hall_ticket_number, seat_allotment, qr_verification_code) VALUES
    ('ereg_1', 'tenant_apex', 'exam_1', 'user_student_1', 'REGISTERED', 'HT-2026-CS-0842-A1', 'Desk 42, Row D', 'VERIFIED_HT_0842_EX1');

    INSERT INTO internal_marks (id, tenant_id, course_id, student_id, assessment_name, max_marks, marks_obtained, evaluated_by) VALUES
    ('im_1', 'tenant_apex', 'course_cs201', 'user_student_1', 'Continuous Assessment 1', 25.0, 24.0, 'Prof. Arvind Namboodiri'),
    ('im_2', 'tenant_apex', 'course_cs201', 'user_student_1', 'Lab Practical Assessment', 25.0, 25.0, 'Prof. Arvind Namboodiri'),
    ('im_3', 'tenant_apex', 'course_cs301', 'user_student_1', 'Internal Test 1', 30.0, 28.5, 'Prof. Arvind Namboodiri');

    INSERT INTO digital_certificates (id, tenant_id, user_id, certificate_type, title, issue_date, cryptographic_hash, pdf_url, metadata_json) VALUES
    ('cert_1', 'tenant_apex', 'user_student_1', 'MERIT', 'Academic Excellence Dean List Award 2025-2026', '2026-08-15', 'a7f92b49c011e48f7d9321c43b9281aef12d4a781b49021', '/certs/dean_merit_0842.pdf', '{"cgpa": 9.62, "semester": 4, "rank": 1}');

    INSERT INTO academic_calendar (id, tenant_id, title, event_type, start_date, end_date, description) VALUES
    ('cal_1', 'tenant_apex', 'Odd Semester End-Term Examinations', 'EXAM_WEEK', '2026-11-20', '2026-12-05', 'Final examinations for undergraduate and postgraduate streams.'),
    ('cal_2', 'tenant_apex', 'Winter Break & Student Research Symposium', 'HOLIDAY', '2026-12-15', '2027-01-05', 'Campus academic hiatus with research presentations on Dec 20.');
  `);
  applyMewarDemoTimetable();
  applyMewarDemoExams();
  seedMewarCatalog(db);
  seedMewarStudentRoster(db);

  // 4. VISITOR MANAGEMENT
  db.exec(`
    INSERT INTO visitor_requests (id, tenant_id, campus_id, visitor_name, visitor_phone, visitor_email, id_proof_type, id_proof_number, host_user_id, purpose, expected_arrival, host_approval_status, pass_qr_code, allowed_zones) VALUES
    ('vis_1', 'tenant_apex', 'campus_apex_main', 'Sunil Narang', '+91 99112 33445', 'sunil@technocorp.in', 'AADHAAR', 'XXXX-XXXX-4812', 'user_faculty_1', 'Campus Placement & Industry Research Collaboration', '2026-11-02 14:00:00', 'APPROVED', 'QR_VIS_SUNIL_2026', 'ACADEMIC_BLOCK,VISITOR_LOUNGE,FACULTY_TOWER'),
    ('vis_2', 'tenant_apex', 'campus_apex_main', 'Kavita Menon', '+91 98110 55443', 'kavita@edupress.com', 'DRIVERS_LICENSE', 'DL-04-2020-00192', 'user_admin_apex', 'University Accreditation Audit & Documentation', '2026-11-03 10:00:00', 'PENDING', 'QR_VIS_KAVITA_2026', 'ADMIN_BLOCK');
  `);

  // 5. EMERGENCY & SAFETY
  db.exec(`
    INSERT INTO emergency_contacts (id, tenant_id, campus_id, service_name, phone_number, email, operating_hours) VALUES
    ('emc_1', 'tenant_apex', 'campus_apex_main', 'University Rapid Response Police Control', '+91 80 2345 9999', 'sos.dispatch@apex.edu.in', '24/7/365'),
    ('emc_2', 'tenant_apex', 'campus_apex_main', 'Campus Hospital & Trauma Center', '+91 80 2345 8888', 'medical.er@apex.edu.in', '24/7/365'),
    ('emc_3', 'tenant_apex', 'campus_apex_main', 'Women Safety & Anti-Harassment Cell', '+91 80 2345 7777', 'safecampus@apex.edu.in', '24/7/365'),
    ('emc_4', 'tenant_apex', 'campus_apex_main', 'Fire & Disaster Management Desk', '+91 80 2345 6666', 'fire.safety@apex.edu.in', '24/7/365');

    INSERT INTO emergency_broadcasts (id, tenant_id, campus_id, title, message, severity, sent_by) VALUES
    ('broad_1', 'tenant_apex', 'campus_apex_main', 'Severe Weather Warning: Flash Rain Protocol', 'Heavy convective downpours expected between 16:00 and 19:00. Electric shuttle buses will run at 5-minute intervals between hostels and academic blocks.', 'WARNING', 'Campus Chief Proctor');
  `);

  // 6. MAINTENANCE
  db.exec(`
    INSERT INTO maintenance_tickets (id, tenant_id, campus_id, reported_by_user_id, title, description, category, location, photo_url, priority, status, assigned_department, assigned_technician_id, sla_due_hours) VALUES
    ('maint_1', 'tenant_apex', 'campus_apex_main', 'user_student_1', 'Air Conditioning Thermostat Malfunction', 'HVAC unit not cooling in Lab 202, showing sensor error E4.', 'HVAC', 'Lovelace Lab 202, Block C', 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=300', 'HIGH', 'IN_PROGRESS', 'HVAC & Climate Team', 'user_maint_1', 24),
    ('maint_2', 'tenant_apex', 'campus_apex_main', 'user_student_2', 'Flickering LED tube light near study desk', 'Frequent flickering causing eye strain in Room 314.', 'ELECTRICAL', 'Aryabhata Hostel, Room 314', 'https://images.unsplash.com/photo-1550985616-10810253b84d?w=300', 'NORMAL', 'RESOLVED', 'Electrical Maintenance', 'user_maint_1', 48);
  `);

  // 7. FINANCIAL MANAGEMENT (RAZORPAY TEST READY)
  db.exec(`
    INSERT INTO fee_structures (id, tenant_id, course_id, fee_type, amount, due_date, academic_year) VALUES
    ('fee_1', 'tenant_apex', 'course_cs201', 'SEMESTER_TUITION', 75000.0, '2026-11-30', '2026-2027'),
    ('fee_2', 'tenant_apex', NULL, 'HOSTEL_MESS', 42000.0, '2026-11-30', '2026-2027'),
    ('fee_3', 'tenant_apex', NULL, 'CAMPUS_SMART_TRANSPORT', 12000.0, '2026-11-30', '2026-2027');

    INSERT INTO student_fee_dues (id, tenant_id, student_id, fee_structure_id, total_amount, amount_paid, balance_amount, status) VALUES
    ('due_1', 'tenant_apex', 'user_student_1', 'fee_1', 75000.0, 75000.0, 0.0, 'PAID'),
    ('due_2', 'tenant_apex', 'user_student_1', 'fee_2', 42000.0, 42000.0, 0.0, 'PAID'),
    ('due_3', 'tenant_apex', 'user_student_2', 'fee_1', 75000.0, 25000.0, 50000.0, 'PARTIAL');

    INSERT INTO payment_transactions (id, tenant_id, user_id, fee_due_id, razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, currency, payment_mode, status, receipt_number) VALUES
    ('txn_1', 'tenant_apex', 'user_student_1', 'due_1', 'order_RzpApexTest991', 'pay_ApexTestSucc991', 'sig_valid_test_hash_0842', 75000.0, 'INR', 'RAZORPAY_TEST', 'SUCCESS', 'RCP-2026-APEX-09841');

    INSERT INTO scholarships (id, tenant_id, title, description, amount, criteria, application_deadline) VALUES
    ('sch_1', 'tenant_apex', 'National Merit Innovation Scholarship', 'Full tuition waiver for students with CGPA > 9.0 and approved research patent/paper.', 75000.0, 'CGPA >= 9.0, CS/IT/AI stream', '2026-11-25');
  `);

  // 8. DIGITAL LIBRARY
  db.exec(`
    INSERT INTO library_books (id, tenant_id, campus_id, isbn, title, author, category, total_copies, available_copies, shelf_location, is_ebook, ebook_url) VALUES
    ('book_1', 'tenant_apex', 'campus_apex_main', '978-0262033848', 'Introduction to Algorithms (CLRS 4th Ed)', 'Thomas H. Cormen, Charles E. Leiserson', 'Computer Science', 12, 8, 'Shelf CS-04-A', 1, '/ebooks/clrs4.pdf'),
    ('book_2', 'tenant_apex', 'campus_apex_main', '978-0131103627', 'The C Programming Language (ANSI C)', 'Brian W. Kernighan, Dennis M. Ritchie', 'Programming', 8, 3, 'Shelf CS-01-C', 1, '/ebooks/ansi_c.pdf'),
    ('book_3', 'tenant_apex', 'campus_apex_main', '978-0262035613', 'Deep Learning', 'Ian Goodfellow, Yoshua Bengio, Aaron Courville', 'Artificial Intelligence', 6, 2, 'Shelf AI-02-B', 1, '/ebooks/deeplearning_mit.pdf');

    INSERT INTO book_issues (id, tenant_id, book_id, user_id, issue_date, due_date, status) VALUES
    ('issue_1', 'tenant_apex', 'book_1', 'user_student_1', '2026-10-20', '2026-11-04', 'ISSUED');
  `);

  // 9. SMART TRANSPORT
  db.exec(`
    INSERT INTO transport_routes (id, tenant_id, campus_id, route_name, start_point, end_point, stops_json, monthly_fee) VALUES
    ('route_1', 'tenant_apex', 'campus_apex_main', 'Route 12 - Silk Board Express', 'Silk Board Junction', 'Apex Main Campus', '[{"name": "Silk Board Junction", "eta": "07:30"}, {"name": "HSR BDA Complex", "eta": "07:45"}, {"name": "Bellandur EcoSpace", "eta": "08:05"}, {"name": "Apex Knowledge Park", "eta": "08:30"}]', 1800.0),
    ('route_2', 'tenant_apex', 'campus_apex_main', 'Route 05 - Indiranagar Metro Link', 'Indiranagar Metro Station', 'Apex Main Campus', '[{"name": "Indiranagar Metro", "eta": "07:35"}, {"name": "Domlur Flyover", "eta": "07:50"}, {"name": "Marathahalli Bridge", "eta": "08:10"}, {"name": "Apex Knowledge Park", "eta": "08:35"}]', 2000.0);

    INSERT INTO transport_vehicles (id, tenant_id, route_id, bus_number, license_plate, seating_capacity, driver_name, driver_phone, current_lat, current_lng, speed_kmh, next_stop, eta_minutes) VALUES
    ('bus_1', 'tenant_apex', 'route_1', 'APEX-BUS-12', 'KA-01-EQ-9812', 45, 'Balwinder Singh', '+91 98999 00112', 12.9352, 77.6245, 38.5, 'Bellandur EcoSpace', 6);

    INSERT INTO transport_allocations (id, tenant_id, student_id, route_id, vehicle_id, pickup_stop, seat_number) VALUES
    ('t_alloc_1', 'tenant_apex', 'user_student_1', 'route_1', 'bus_1', 'HSR BDA Complex', 'Seat 14');
  `);

  // 10. AI ANALYTICS & STUDENT SUCCESS
  db.exec(`
    INSERT INTO student_success_metrics (student_id, tenant_id, attendance_rate, gpa, assignment_completion_rate, risk_level, explainable_risk_factors, support_recommendations) VALUES
    ('user_student_1', 'tenant_apex', 96.4, 3.92, 100.0, 'LOW', '["Consistently scores in the top 3% in mid-term assessments", "100% on-time assignment submission rate", "No consecutive unexcused absences"]', '["Encourage research paper co-authorship with faculty", "Nominated for Google Student Ambassador program"]'),
    ('user_student_2', 'tenant_apex', 71.8, 2.85, 66.7, 'MODERATE', '["Attendance in CS201 has drifted to 71.8%, below institutional minimum (75%)", "Two consecutive missed lab sessions in week 6", "Partial fee due of ₹50,000"]', '["Schedule academic advisory check-in with Prof. Namboodiri", "Peer tutoring referral for Algorithms module", "Student welfare fee assistance consultation"]');
  `);

  // 11. PLACEMENT & CAREER
  db.exec(`
    INSERT INTO placement_companies (id, tenant_id, company_name, industry, website, tier, verified) VALUES
    ('comp_1', 'tenant_apex', 'Google Cloud India', 'Cloud & AI Infrastructure', 'https://careers.google.com', 'DREAM', 1),
    ('comp_2', 'tenant_apex', 'Microsoft IDC', 'Enterprise Systems & Azure', 'https://careers.microsoft.com', 'DREAM', 1),
    ('comp_3', 'tenant_apex', 'NVIDIA Corporation', 'Accelerated Computing & GPUs', 'https://nvidia.com/careers', 'DREAM', 1);

    INSERT INTO job_openings (id, tenant_id, company_id, title, job_type, ctc_lpa, eligible_departments, min_cgpa, max_backlogs, deadline, description) VALUES
    ('job_1', 'tenant_apex', 'comp_1', 'Software Engineer - Distributed Systems', 'FULL_TIME', 32.5, 'Computer Science & Engineering,Information Technology', 8.5, 0, '2026-11-28', 'Designing hyper-scale backend microservices, Kubernetes telemetry, and high-throughput networking.'),
    ('job_2', 'tenant_apex', 'comp_3', 'AI Compiler & GPU Systems Intern', 'INTERNSHIP', 12.0, 'Computer Science & Engineering', 8.0, 0, '2026-11-30', 'Six-month paid internship working on CUDA kernels, TensorRT optimizations, and LLM inference engine acceleration.');

    INSERT INTO job_applications (id, tenant_id, job_id, student_id, resume_url, stage, interview_date) VALUES
    ('app_1', 'tenant_apex', 'job_1', 'user_student_1', '/resumes/aarav_patel_swe.pdf', 'INTERVIEW_SCHEDULED', '2026-11-06 14:30:00');

    INSERT INTO student_resumes (student_id, tenant_id, skills, projects_json, certifications_json, summary) VALUES
    ('user_student_1', 'tenant_apex', 'C++, Java, Python, TypeScript, React, PostgreSQL, Docker, Kubernetes', '[{"title": "Distributed Multi-Tenant Queue", "description": "High throughput pub-sub message broker in Go handling 120k msgs/sec."}, {"title": "Smart Campus Assistant", "description": "Privacy-aware LLM tool for student records query."}]', '[{"name": "AWS Certified Solutions Architect", "year": "2025"}]', 'Passionate 3rd-year CS student specialized in systems programming and scalable backend architectures.');
  `);

  // 12. EVENTS & CLUBS
  db.exec(`
    INSERT INTO student_clubs (id, tenant_id, name, category, lead_student_id, faculty_advisor_id, description, member_count) VALUES
    ('club_1', 'tenant_apex', 'ACM Student Chapter', 'TECH', 'user_student_1', 'user_faculty_1', 'Premier computing society organizing hackathons, algorithmic code-sprints, and tech seminars.', 340),
    ('club_2', 'tenant_apex', 'Apex Robotics & Autonomous Systems', 'ROBOTICS', 'user_student_2', 'user_faculty_1', 'Building competitive combat robots, drones, and quadrupeds for national Olympiads.', 120);

    INSERT INTO events (id, tenant_id, campus_id, club_id, title, description, category, venue, event_date, start_time, end_time, capacity, registered_count, dean_approval_status) VALUES
    ('evt_1', 'tenant_apex', 'campus_apex_main', 'club_1', 'Apex HackForge 2026: 36-Hour National Hackathon', 'Flagship university hackathon featuring tracks in Agentic AI, Fintech, Cyber Resilience, and Clean Energy.', 'TECH', 'Main Auditorium & Turing Hall', '2026-11-18', '09:00', '21:00', 500, 312, 'APPROVED');

    INSERT INTO event_registrations (id, tenant_id, event_id, user_id, qr_ticket, attended) VALUES
    ('ereg_evt_1', 'tenant_apex', 'evt_1', 'user_student_1', 'TICKET_HACKFORGE_0842', 0);
  `);

  // 13. CAFETERIA & MESS
  db.exec(`
    INSERT INTO cafeteria_items (id, tenant_id, campus_id, name, category, dietary_type, price, calories, available) VALUES
    ('item_1', 'tenant_apex', 'campus_apex_main', 'South Indian Filter Coffee', 'BEVERAGES', 'VEG', 25.0, 85, 1),
    ('item_2', 'tenant_apex', 'campus_apex_main', 'Ghee Roast Masala Dosa', 'BREAKFAST', 'VEG', 65.0, 380, 1),
    ('item_3', 'tenant_apex', 'campus_apex_main', 'Paneer Butter Masala Combo Bowl', 'LUNCH', 'VEG', 120.0, 560, 1),
    ('item_4', 'tenant_apex', 'campus_apex_main', 'Grilled Chicken Salad with Vinaigrette', 'LUNCH', 'NON_VEG', 150.0, 420, 1);

    INSERT INTO mess_subscriptions (id, tenant_id, student_id, plan_name, monthly_fee, month_year, status, qr_pass) VALUES
    ('mess_sub_1', 'tenant_apex', 'user_student_1', '3-Meal Platinum Royal Dining Plan', 4500.0, '2026-11', 'ACTIVE', 'MESS_PASS_0842_NOV26');
  `);

  // 14. RESOURCE BOOKING
  db.exec(`
    INSERT INTO campus_resources (id, tenant_id, campus_id, name, resource_type, capacity, amenities, requires_faculty_approval, status) VALUES
    ('res_1', 'tenant_apex', 'campus_apex_main', 'AI Supercomputing Cluster Lab (8x H100)', 'LAB', 30, 'NVIDIA H100 SXM5, 100Gbps InfiniBand, Smartboard', 1, 'AVAILABLE'),
    ('res_2', 'tenant_apex', 'campus_apex_main', 'Sir C.V. Raman Seminar Hall', 'SEMINAR_HALL', 200, 'Dolby Acoustics, Dual Laser Projectors, Live Streaming Cameras', 1, 'AVAILABLE'),
    ('res_3', 'tenant_apex', 'campus_apex_main', 'Project Discussion Room 4', 'PROJECT_ROOM', 10, 'Glass whiteboard, 65-inch OLED TV, Video Conferencing', 0, 'AVAILABLE');

    INSERT INTO resource_reservations (id, tenant_id, resource_id, requested_by_user_id, purpose, date, start_time, end_time, approval_status, approved_by) VALUES
    ('res_book_1', 'tenant_apex', 'res_1', 'user_student_1', 'Fine-tuning 7B Parameter LLM for Campus Assistant', '2026-11-04', '16:00', '19:00', 'APPROVED', 'Prof. Arvind Namboodiri');
  `);

  // 15. ALUMNI
  db.exec(`
    INSERT INTO alumni_profiles (id, tenant_id, user_id, graduation_year, degree, current_company, designation, linkedin_url, available_for_mentorship) VALUES
    ('alumni_1', 'tenant_apex', 'user_owner', 2018, 'B.Tech in Computer Science', 'Stripe / Fintech Cloud', 'Principal Systems Architect', 'https://linkedin.com/in/alumni-apex', 1);

    INSERT INTO alumni_donations (id, tenant_id, alumni_id, amount, purpose, receipt_number) VALUES
    ('don_1', 'tenant_apex', 'alumni_1', 250000.0, 'SCHOLARSHIP_FUND', 'DON-2026-APEX-0012');
  `);

  // 16. LOST & FOUND
  db.exec(`
    INSERT INTO lost_found_items (id, tenant_id, campus_id, item_type, title, category, description, location, photo_url, status, reported_by_user_id) VALUES
    ('lf_1', 'tenant_apex', 'campus_apex_main', 'FOUND', 'Sony WH-1000XM5 Noise-Cancelling Headphones (Silver)', 'ELECTRONICS', 'Found on 2nd floor library study carrel desk #18.', 'Central Library 2nd Floor', 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300', 'ACTIVE', 'user_lib_1'),
    ('lf_2', 'tenant_apex', 'campus_apex_main', 'LOST', 'Blue Leather Wallet with College ID & Metro Card', 'WALLET_ID', 'Misplaced after evening badminton session in sports complex.', 'Indoor Sports Complex', NULL, 'ACTIVE', 'user_student_2');
  `);

  // 17. DIGITAL IDENTITY
  db.exec(`
    INSERT INTO dynamic_qr_tokens (id, tenant_id, user_id, token_seed, signature, expires_at) VALUES
    ('dqr_1', 'tenant_apex', 'user_student_1', 'SEED_AARAV_0842_DYNAMIC_2026', 'HMAC_SHA256_VALID_SEC_SIG', datetime('now', '+60 seconds'));
  `);

  // 18. GRIEVANCE & ANTI-RAGGING
  db.exec(`
    INSERT INTO grievances (id, tenant_id, campus_id, tracking_ticket_number, category, confidentiality_level, submitted_by_user_id, subject, details, priority, status, auto_escalation_deadline, is_escalated) VALUES
    ('grv_1', 'tenant_apex', 'campus_apex_main', 'GRV-2026-9041', 'ANTI_RAGGING', 'CONFIDENTIAL', 'user_student_2', 'Inquiry regarding late-night senior hostel noise disturbance', 'Reported aggressive shouting and unauthorized access at Block D stairway at 1:30 AM.', 'EMERGENCY_CRITICAL', 'COMMITTEE_ASSIGNED', datetime('now', '+72 hours'), 0);
  `);

  // 21. ADMINISTRATIVE AUTOMATION WORKFLOWS
  db.exec(`
    INSERT INTO automation_workflows (id, tenant_id, name, trigger_event, condition_json, action_type, action_payload_json, is_active) VALUES
    ('wf_1', 'tenant_apex', 'Automatic Attendance Defaulter Notification', 'ATTENDANCE_DROP_BELOW_75', '{"threshold": 75.0}', 'SEND_PARENT_SMS', '{"template": "Dear Parent, attendance for {{student_name}} is {{attendance_pct}}%, which has fallen below mandatory 75% limit."}', 1),
    ('wf_2', 'tenant_apex', 'SLA Escalation for Critical Safety Work Orders', 'MAINTENANCE_SLA_BREACH', '{"priority": "URGENT", "hours_open": 24}', 'ESCALATE_TICKET', '{"target_role": "CAMPUS_ADMIN", "alert": "Urgent Maintenance ticket unaddressed for 24h"}', 1);
  `);

  // 22. SECURITY AUDIT LOGS
  db.exec(`
    INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, details) VALUES
    ('aud_1', 'tenant_apex', 'user_student_1', 'LOGIN', 'SESSION', 'user_student_1', '192.168.1.45', '{"auth_mode": "PASSWORD", "success": true}'),
    ('aud_2', 'tenant_apex', 'user_student_1', 'SUBMIT_ASSIGNMENT', 'ASSIGNMENT', 'assign_1', '192.168.1.45', '{"filename": "aarav_rb_tree.zip"}');
  `);

  console.log('Seeding completed successfully with rich datasets across all 22 modules!');
}

function applyMewarDemoProfile() {
  const student = db.prepare(`
    SELECT id, tenant_id FROM users WHERE id = 'user_student_1'
  `).get();
  if (!student || student.tenant_id !== 'tenant_apex') return;

  db.prepare(`
    UPDATE users SET university_id = ?, name = ?, card_status = 'ACTIVE' WHERE id = ? AND tenant_id = ?
  `).run('MUR2600425', 'Md Aarif Hussain', student.id, student.tenant_id);

  const insertDemoContact = db.prepare(`
    INSERT OR IGNORE INTO users (
      id, tenant_id, campus_id, university_id, name, email, password_hash,
      role, department, card_status, mfa_enabled
    ) VALUES (?, 'tenant_apex', 'campus_apex_main', ?, ?, ?, ?, ?, ?, 'ACTIVE', 0)
  `);

  insertDemoContact.run(
    'user_warden_mewar',
    'MUR-WARDEN-001',
    'Mewar Campus Warden (Demo)',
    'warden@mewaruniversity.demo',
    hashPassword('password123'),
    'WARDEN',
    'Student Welfare'
  );
  insertDemoContact.run(
    'user_counsellor_mewar',
    'MUR-COUNSELLOR-001',
    'Mewar Campus Counsellor (Demo)',
    'counsellor@mewaruniversity.demo',
    hashPassword('password123'),
    'COUNSELLOR',
    'Student Counselling'
  );

  const faculty = [
    ['user_faculty_mewar_ajay', 'MUR-FAC-001', 'Mr. Ajay Singh Dhabariya', 'ajay.dhabariya@mewaruniversity.demo'],
    ['user_faculty_mewar_saurav', 'MUR-FAC-002', 'Mr. Saurav Singh', 'saurav.singh@mewaruniversity.demo'],
    ['user_faculty_mewar_chandra', 'MUR-FAC-003', 'Mr. Chandra Shekhar', 'chandra.shekhar@mewaruniversity.demo'],
    ['user_faculty_mewar_veerkant', 'MUR-FAC-004', 'Mr. Veerkant Bhaskar', 'veerkant.bhaskar@mewaruniversity.demo'],
    ['user_faculty_mewar_blpal', 'MUR-FAC-005', 'Mr. B. L. Pal', 'bl.pal@mewaruniversity.demo'],
    ['user_faculty_mewar_vandana', 'MUR-FAC-006', 'Dr. Vandana Chundawat', 'vandana.chundawat@mewaruniversity.demo'],
    ['user_faculty_mewar_unlisted', 'MUR-FAC-007', 'Faculty not listed', 'faculty.unlisted@mewaruniversity.demo']
  ];
  const insertFaculty = db.prepare(`
    INSERT OR IGNORE INTO users (
      id, tenant_id, campus_id, university_id, name, email, password_hash,
      role, department, card_status, mfa_enabled
    ) VALUES (?, 'tenant_apex', 'campus_apex_main', ?, ?, ?, ?, 'FACULTY',
      'Computer Science & Engineering', 'ACTIVE', 0)
  `);
  for (const [id, universityId, name, email] of faculty) {
    insertFaculty.run(id, universityId, name, email, hashPassword('password123'));
  }
}

function applyMewarDemoTimetable() {
  const student = db.prepare(`
    SELECT id, tenant_id FROM users WHERE id = 'user_student_1'
  `).get();
  if (!student || student.tenant_id !== 'tenant_apex') return;

  const courses = [
    ['mewar_sem5_dbms', 'DBMS', 'Database Management System'],
    ['mewar_sem5_dbms_lab', 'DBMS-LAB', 'Database Management System Lab'],
    ['mewar_sem5_se', 'SE', 'Software Engineering'],
    ['mewar_sem5_se_lab', 'SE-LAB', 'Software Engineering Lab'],
    ['mewar_sem5_ai', 'AI-ELECTIVE', 'Elective: Artificial Intelligence and Its Applications'],
    ['mewar_sem5_library', 'LIB', 'Library'],
    ['mewar_sem5_seminar', 'SEMINAR', 'Seminar / Minor Project / Short Training'],
    ['mewar_sem5_cyber', 'CYBER-SEC', 'Introduction to Cyber Security'],
    ['mewar_sem5_toc', 'TOC', 'Theory of Computation'],
    ['mewar_sem5_pdss', 'PDSS', 'Personality Development and Soft Skills']
  ];
  const insertCourse = db.prepare(`
    INSERT OR IGNORE INTO courses (
      id, tenant_id, code, title, department, credits, semester
    ) VALUES (?, ?, ?, ?, 'Computer Science & Engineering', 3, 5)
  `);
  const insertEnrollment = db.prepare(`
    INSERT INTO course_enrollments (id, tenant_id, course_id, student_id, academic_year, status)
    VALUES (?, ?, ?, ?, '2026-2027', 'ACTIVE')
    ON CONFLICT(id) DO UPDATE SET status = 'ACTIVE'
  `);

  const schedule = [
    ['Monday', 'mewar_sem5_se', 'user_faculty_mewar_ajay', 2, 2, 'MB-141'],
    ['Monday', 'mewar_sem5_dbms_lab', 'user_faculty_mewar_saurav', 3, 4, 'MB-109', 'Group 1'],
    ['Monday', 'mewar_sem5_se_lab', 'user_faculty_mewar_ajay', 3, 4, 'MB-112', 'Group 2'],
    ['Monday', 'mewar_sem5_seminar', 'user_faculty_mewar_unlisted', 6, 7, 'NF-1 CSE'],
    ['Monday', 'mewar_sem5_cyber', 'user_faculty_mewar_veerkant', 8, 8, 'MB-119'],
    ['Tuesday', 'mewar_sem5_ai', 'user_faculty_mewar_chandra', 1, 1, 'MB-119'],
    ['Tuesday', 'mewar_sem5_dbms', 'user_faculty_mewar_saurav', 2, 2, 'MB-119'],
    ['Tuesday', 'mewar_sem5_library', 'user_faculty_mewar_unlisted', 3, 3, 'Library'],
    ['Tuesday', 'mewar_sem5_se', 'user_faculty_mewar_ajay', 5, 5, 'MB-116'],
    ['Tuesday', 'mewar_sem5_cyber', 'user_faculty_mewar_veerkant', 6, 6, 'MB-116'],
    ['Tuesday', 'mewar_sem5_toc', 'user_faculty_mewar_blpal', 7, 7, 'MB-118'],
    ['Wednesday', 'mewar_sem5_ai', 'user_faculty_mewar_chandra', 1, 1, 'MB-117'],
    ['Wednesday', 'mewar_sem5_toc', 'user_faculty_mewar_blpal', 2, 2, 'MB-119'],
    ['Wednesday', 'mewar_sem5_se', 'user_faculty_mewar_ajay', 3, 3, 'MB-141'],
    ['Wednesday', 'mewar_sem5_cyber', 'user_faculty_mewar_veerkant', 5, 5, 'MB-119'],
    ['Wednesday', 'mewar_sem5_pdss', 'user_faculty_mewar_vandana', 6, 6, 'MB-235'],
    ['Thursday', 'mewar_sem5_dbms', 'user_faculty_mewar_saurav', 1, 1, 'MB-205'],
    ['Thursday', 'mewar_sem5_ai', 'user_faculty_mewar_chandra', 2, 2, 'MB-235'],
    ['Thursday', 'mewar_sem5_toc', 'user_faculty_mewar_blpal', 3, 3, 'MB-118'],
    ['Thursday', 'mewar_sem5_pdss', 'user_faculty_mewar_vandana', 5, 5, 'MB-118'],
    ['Thursday', 'mewar_sem5_se_lab', 'user_faculty_mewar_ajay', 6, 7, 'MB-108', 'Group 1'],
    ['Thursday', 'mewar_sem5_dbms_lab', 'user_faculty_mewar_saurav', 6, 7, 'MB-109', 'Group 2'],
    ['Saturday', 'mewar_sem5_cyber', 'user_faculty_mewar_veerkant', 1, 1, 'MB-118'],
    ['Saturday', 'mewar_sem5_ai', 'user_faculty_mewar_chandra', 2, 2, 'MB-119'],
    ['Saturday', 'mewar_sem5_toc', 'user_faculty_mewar_blpal', 3, 3, 'MB-119'],
    ['Saturday', 'mewar_sem5_se', 'user_faculty_mewar_ajay', 5, 5, 'MB-119'],
    ['Saturday', 'mewar_sem5_dbms', 'user_faculty_mewar_saurav', 6, 6, 'MB-119']
  ];
  const periodTimes = {
    1: ['09:30', '10:20'],
    2: ['10:20', '11:10'],
    3: ['11:10', '12:00'],
    4: ['12:00', '12:50'],
    5: ['12:50', '13:40'],
    6: ['13:40', '14:30'],
    7: ['14:30', '15:20'],
    8: ['15:20', '16:10'],
    9: ['16:10', '17:00']
  };
  const insertTimetable = db.prepare(`
    INSERT INTO timetables (
      id, tenant_id, campus_id, course_id, faculty_id, day_of_week,
      start_time, end_time, room_number, batch_section
    ) VALUES (?, ?, 'campus_apex_main', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      course_id = excluded.course_id,
      faculty_id = excluded.faculty_id,
      day_of_week = excluded.day_of_week,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      room_number = excluded.room_number,
      batch_section = excluded.batch_section
  `);

  db.exec('BEGIN');
  try {
    for (const [courseId, code, title] of courses) {
      insertCourse.run(courseId, student.tenant_id, code, title);
      insertEnrollment.run(
        `mewar_enr_${courseId}`,
        student.tenant_id,
        courseId,
        student.id
      );
    }

    db.prepare(`
      UPDATE course_enrollments
      SET status = 'DROPPED'
      WHERE student_id = ?
        AND id IN ('enr_1', 'enr_2', 'enr_3')
        AND status = 'ACTIVE'
    `).run(student.id);

    for (const [index, [day, courseId, facultyId, firstPeriod, lastPeriod, room, group]] of schedule.entries()) {
      const startTime = periodTimes[firstPeriod][0];
      const endTime = periodTimes[lastPeriod][1];
      const section = group ? `A - ${group}` : 'A';
      insertTimetable.run(
        `mewar_tt_${index + 1}`,
        student.tenant_id,
        courseId,
        facultyId,
        day,
        startTime,
        endTime,
        room,
        section
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function applyMewarDemoExams() {
  const student = db.prepare(`
    SELECT id, tenant_id FROM users WHERE id = 'user_student_1'
  `).get();
  if (!student || student.tenant_id !== 'tenant_apex') return;

  const exams = [
    ['mewar_exam_sem5_dbms', 'mewar_sem5_dbms', 'PCC-CS501', 'Database Management System', '2026-11-30'],
    ['mewar_exam_sem5_se', 'mewar_sem5_se', 'PCC-CS503', 'Software Engineering', '2026-12-01'],
    ['mewar_exam_sem5_cyber', 'mewar_sem5_cyber', 'PCC-CS504', 'Introduction to Cyber Security', '2026-12-02'],
    ['mewar_exam_sem5_ai', 'mewar_sem5_ai', 'PEC CSEL 309-407', "Artificial Intelligence and It's Applications", '2026-12-03'],
    ['mewar_exam_sem5_pdss', 'mewar_sem5_pdss', 'AU301', 'Personality Development and Soft Skills', '2026-12-04'],
    ['mewar_exam_sem5_toc', 'mewar_sem5_toc', 'PCC-CS502', 'Theory of Computation', '2026-12-05']
  ];
  const updateCourse = db.prepare(`
    UPDATE courses SET code = ?, title = ? WHERE id = ? AND tenant_id = ?
  `);
  const upsertExam = db.prepare(`
    INSERT INTO exam_schedules (
      id, tenant_id, campus_id, course_id, exam_name, exam_date,
      start_time, end_time, hall_number, registration_deadline
    ) VALUES (?, ?, 'campus_apex_main', ?, 'End-Term Exam (Nov-Dec 2026)', ?, '14:00', '17:00',
      'Not listed in uploaded date sheet', NULL)
    ON CONFLICT(id) DO UPDATE SET
      course_id = excluded.course_id,
      exam_name = excluded.exam_name,
      exam_date = excluded.exam_date,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      hall_number = excluded.hall_number,
      registration_deadline = excluded.registration_deadline
  `);

  db.exec('BEGIN');
  try {
    for (const [examId, courseId, code, title, examDate] of exams) {
      updateCourse.run(code, title, courseId, student.tenant_id);
      upsertExam.run(examId, student.tenant_id, courseId, examDate);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
