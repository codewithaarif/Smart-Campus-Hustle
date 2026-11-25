import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import db from './db/connection.js';
import { seedDatabase } from './db/seed.js';
import { rateLimiter } from './middleware/rateLimit.js';
import { authMiddleware } from './middleware/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';

import { handleAuthRoutes } from './routes/authRoutes.js';
import { handleAcademicRoutes } from './routes/academicRoutes.js';
import { handleOperationsRoutes } from './routes/operationsRoutes.js';
import { handleFinanceRoutes } from './routes/financeRoutes.js';
import { handleLibraryRoutes } from './routes/libraryRoutes.js';
import { handleCareerAlumniRoutes } from './routes/careerAlumniRoutes.js';
import { handleIdentitySaasRoutes } from './routes/identitySaasRoutes.js';
import { handleUniversityRoutes } from './routes/universityRoutes.js';
import { handleOfflineRoutes } from './routes/offlineRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 5050);
const MAX_BODY_BYTES = 1024 * 1024;

if (!Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}

// Sample users and records are development fixtures, never an implicit production seed.
if (!IS_PRODUCTION || process.env.SEED_DEMO_DATA === 'true') {
  seedDatabase();
}

const sseClients = new Set();

export function broadcastEvent(event, data, tenantId) {
  const payload = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  for (const client of sseClients) {
    if (tenantId && client.tenantId !== tenantId) continue;
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// GPS is a local demonstration only. A production deployment must use authenticated telemetry.
if (!IS_PRODUCTION || process.env.SIMULATE_GPS === 'true') {
  const gpsTimer = setInterval(() => {
    try {
      const bus = db.prepare('SELECT * FROM transport_vehicles WHERE id = ?').get('bus_1');
      if (!bus) return;
      const latitude = Number((bus.current_lat + (Math.random() - 0.48) * 0.001).toFixed(6));
      const longitude = Number((bus.current_lng + (Math.random() - 0.48) * 0.001).toFixed(6));
      const speed = Number((30 + Math.random() * 15).toFixed(1));
      const eta = Math.max(1, (bus.eta_minutes || 5) + (Math.random() > 0.7 ? -1 : 0));
      db.prepare(`
        UPDATE transport_vehicles
        SET current_lat = ?, current_lng = ?, speed_kmh = ?, eta_minutes = ?,
          last_ping = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?
      `).run(latitude, longitude, speed, eta, bus.id, bus.tenant_id);
      broadcastEvent('BUS_TELEMATICS_UPDATE', {
        busId: bus.id, busNumber: bus.bus_number,
        lat: latitude, lng: longitude, speedKmh: speed, etaMinutes: eta
      }, bus.tenant_id);
    } catch (error) {
      console.error('GPS demonstration tick failed:', error);
    }
  }, 5000);
  gpsTimer.unref?.();
}

const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  const sameOrigin = (() => {
    if (typeof origin !== 'string' || typeof req.headers.host !== 'string') return false;
    try {
      return new URL(origin).host.toLowerCase() === req.headers.host.toLowerCase();
    } catch {
      return false;
    }
  })();
  const originAllowed = !origin || sameOrigin || allowedOrigins.has(origin);

  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
  if (origin && originAllowed) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID');

  if (!originAllowed) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED' }));
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'INVALID_URL' }));
    return;
  }
  const pathname = parsedUrl.pathname;

  rateLimiter(req, res, () => {
    const chunks = [];
    let bytesRead = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge || res.writableEnded) return;
      bytesRead += chunk.length;
      if (bytesRead > MAX_BODY_BYTES) {
        tooLarge = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 1 MB.' }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge || res.writableEnded) return;
      let body = {};
      if (bytesRead > 0) {
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.includes('application/json')) {
          res.writeHead(415, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Send request bodies as application/json.' }));
          return;
        }
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Expected a JSON object.');
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_JSON', message: 'Request body must be a valid JSON object.' }));
          return;
        }
      }

      try {
        authMiddleware(req, res, () => {
          const publicLogin = pathname === '/api/auth/login' && req.method === 'POST';
          const publicDemoDirectory = pathname === '/api/auth/demo-users' &&
            req.method === 'GET' && !IS_PRODUCTION &&
            process.env.ENABLE_DEMO_ENDPOINTS === 'true';
          if (pathname.startsWith('/api/') && !publicLogin && !publicDemoDirectory && !req.user) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Sign in to access this campus resource.' }));
            return;
          }

          tenantMiddleware(req, res, () => {
            if (pathname === '/api/live-stream' && req.method === 'GET') {
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive'
              });
              res.write('retry: 10000\n\n');
              const client = { res, tenantId: req.tenant.id };
              sseClients.add(client);
              req.on('close', () => sseClients.delete(client));
              return;
            }

            try {
              if (
                handleAuthRoutes(req, res, pathname, body) ||
                handleOfflineRoutes(req, res, pathname, body) ||
                handleAcademicRoutes(req, res, pathname, body) ||
                handleOperationsRoutes(req, res, pathname, body) ||
                handleFinanceRoutes(req, res, pathname, body) ||
                handleLibraryRoutes(req, res, pathname, body) ||
                handleCareerAlumniRoutes(req, res, pathname, body) ||
                handleIdentitySaasRoutes(req, res, pathname, body) ||
                handleUniversityRoutes(req, res, pathname, body)
              ) return;

              const distDir = path.resolve(__dirname, '..', 'dist');
              if (fs.existsSync(distDir) && !pathname.startsWith('/api')) {
                let requestedPath;
                try {
                  requestedPath = decodeURIComponent(pathname);
                } catch {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'INVALID_PATH' }));
                  return;
                }
                const target = path.resolve(distDir, '.' + (requestedPath === '/' ? '/index.html' : requestedPath));
                if (target !== distDir && !target.startsWith(distDir + path.sep)) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'INVALID_PATH' }));
                  return;
                }
                const filePath = fs.existsSync(target) && fs.statSync(target).isFile()
                  ? target
                  : path.join(distDir, 'index.html');
                const mimeTypes = {
                  '.html': 'text/html; charset=utf-8',
                  '.js': 'application/javascript; charset=utf-8',
                  '.css': 'text/css; charset=utf-8',
                  '.json': 'application/json; charset=utf-8',
                  '.png': 'image/png',
                  '.svg': 'image/svg+xml',
                  '.webp': 'image/webp',
                  '.ico': 'image/x-icon'
                };
                res.writeHead(200, {
                  'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
                });
                res.end(fs.readFileSync(filePath));
                return;
              }

              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'NOT_FOUND', path: pathname }));
            } catch (error) {
              console.error('Request handler failed:', error);
              if (!res.writableEnded) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'INTERNAL_SERVER_ERROR', message: 'The request could not be completed.' }));
              }
            }
          });
        });
      } catch (error) {
        console.error('Request middleware failed:', error);
        if (!res.writableEnded) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'INTERNAL_SERVER_ERROR' }));
        }
      }
    });
  });
});

server.listen(PORT, () => {
  console.log('Smart Campus API listening on port ' + PORT + ' (' + (IS_PRODUCTION ? 'production' : 'development') + ').');
});

function shutdown() {
  for (const client of sseClients) {
    try { client.res.end(); } catch {}
  }
  sseClients.clear();
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
