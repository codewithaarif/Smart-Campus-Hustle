import test from 'node:test';
import assert from 'node:assert';
import { DynamicQRService } from '../server/services/qrService.js';
import db from '../server/db/connection.js';
import { seedDatabase } from '../server/db/seed.js';

seedDatabase();

test('Module 20 Gate Pass Security: Tampered or Forged Dynamic Token is Rejected', () => {
  const dynamicQR = DynamicQRService.generateDynamicIDToken('user_student_1', 'tenant_apex');
  
  // Tamper with payload
  const tamperedToken = dynamicQR.token.slice(0, -6) + 'AAAAAA';
  const result = DynamicQRService.verifyDynamicIDToken(tamperedToken);

  assert.strictEqual(result.valid, false, 'Tampered token must be rejected');
  assert.ok(result.error.includes('TAMPERED') || result.error.includes('INVALID'), 'Must identify cryptographic failure');
});

test('Module 20 Gate Pass Security: Controlled Emergency Outage Override Requires Dual Credentials', () => {
  // Test invalid PIN rejection
  const invalidResult = DynamicQRService.emergencyGateOverride({
    officerId: 'user_guard_1',
    dualWitnessId: 'user_admin_apex',
    officerPin: 'WRONG_PIN_000',
    reason: 'Power failure at North turnstile',
    studentUniversityId: 'MUR2600425',
    tenantId: 'tenant_apex'
  });
  assert.strictEqual(invalidResult.success, false, 'Invalid override PIN must fail');

  const priorPin = process.env.EMERGENCY_OVERRIDE_PIN;
  process.env.EMERGENCY_OVERRIDE_PIN = 'test-only-emergency-override-secret';
  let validResult;
  try {
    validResult = DynamicQRService.emergencyGateOverride({
      officerId: 'user_guard_1',
      dualWitnessId: 'user_admin_apex',
      officerPin: process.env.EMERGENCY_OVERRIDE_PIN,
      reason: 'Fiber optic line cut causing campus internet outage with manual identity confirmation',
      studentUniversityId: 'MUR2600425',
      tenantId: 'tenant_apex'
    });
  } finally {
    if (priorPin === undefined) delete process.env.EMERGENCY_OVERRIDE_PIN;
    else process.env.EMERGENCY_OVERRIDE_PIN = priorPin;
  }
  assert.strictEqual(validResult.success, true, 'Emergency override requires valid staff records and configured PIN');
  assert.ok(validResult.auditRecordId, 'Audit record ID should be returned');

  // Verify audit log has the emergency record
  const log = db.prepare('SELECT * FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT 1').get('EMERGENCY_GATE_OVERRIDE');
  assert.ok(log, 'Emergency override must be logged in audit trail');
});
