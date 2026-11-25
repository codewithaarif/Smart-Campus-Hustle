# Security and production configuration

## Required secrets

Set independent, randomly generated values for:

- `JWT_SECRET`: at least 32 bytes; signs login tokens.
- `QR_SECRET`: at least 32 bytes; signs dynamic identity QR credentials.
- `EMERGENCY_OVERRIDE_PIN`: private emergency credential, provisioned only to the campus security process.

Do not reuse values between environments or commit actual values. Restart the API after changing a secret. Rotating JWT and QR secrets invalidates tokens already issued with the previous key.

## Payments

Development defaults to a clearly identified local mock flow. The mock verifier accepts only the fixed internal marker and is disabled whenever `NODE_ENV=production`.

For production set `PAYMENTS_MODE=razorpay`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`. The server creates orders from the outstanding database balance and verifies Razorpay's HMAC signature. Keep payment credentials server-side only. Before accepting live payments, configure gateway webhooks and reconcile captured/refunded status with the provider dashboard.

## Database

SQLite data is local runtime state and is excluded from source control. Back up the database and WAL safely, restrict file permissions, and test restore procedures. The schema uses additive `CREATE TABLE IF NOT EXISTS` statements; deploy schema changes with a backup and migration plan.

## Offline behavior

Only the app shell is cached by the service worker. Authenticated API responses are never written to Cache Storage. The supported offline action is `OFFLINE_DRAFT_MAINTENANCE`; other action types remain queued and are not silently discarded. Sync is idempotent per user, tenant, and client operation ID.

## Operational limitations

The QR verifier uses short-lived, single-use nonces. It is a server-side identity check, not an access-control hardware integration. A physical gate controller must independently enforce relay control and record the actual actuator result.

Transport GPS simulation is disabled by default in production. Real telemetry requires an authenticated driver/vehicle device integration.
