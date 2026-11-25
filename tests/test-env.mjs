import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Each test worker receives its own temporary SQLite database. The main suite is
// run serially so modules that intentionally share data within a file remain stable.
const dbPath = path.join(os.tmpdir(), 'smart-campus-test-' + process.pid + '.db');
for (const suffix of ['', '-wal', '-shm']) {
  try { fs.rmSync(dbPath + suffix, { force: true }); } catch {}
}
process.env.DATABASE_PATH = dbPath;
process.env.NODE_ENV = 'test';
process.env.PAYMENTS_MODE = 'mock';
process.env.QR_SECRET = process.env.QR_SECRET || 'local-test-qr-signing-secret-at-least-32-bytes';
