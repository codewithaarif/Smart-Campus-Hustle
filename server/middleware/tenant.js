import db from '../db/connection.js';

export function tenantMiddleware(req, res, next) {
  let requestedTenantId;
  try {
    const parsedUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    requestedTenantId = req.headers['x-tenant-id'] || parsedUrl.searchParams.get('tenant_id') ||
      req.user?.tenant_id || 'tenant_apex';
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'INVALID_URL' }));
    return;
  }

  if (req.user && (req.user.role !== 'PLATFORM_OWNER' || req.user.card_status !== 'ACTIVE') && requestedTenantId !== req.user.tenant_id) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'TENANT_MISMATCH', message: 'The authenticated account cannot access another institution.' }));
    return;
  }

  try {
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ? OR slug = ?')
      .get(requestedTenantId, requestedTenantId);
    if (!tenant) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID_TENANT', message: 'Tenant institution not recognized.' }));
      return;
    }
    if (tenant.subscription_status === 'SUSPENDED') {
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'TENANT_SUSPENDED', message: 'This institution subscription is suspended.' }));
      return;
    }
    req.tenant = tenant;
    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'SERVER_ERROR', message: 'Unable to resolve tenant.' }));
  }
}
