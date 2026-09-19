const assert = require('node:assert');
const auditLogger = require('./backend/auditLogger');

console.log('====================================================');
console.log('Enterprise Tamper-Evident Audit Log Verification Test');
console.log('====================================================\n');

// Phase 1: Verify current baseline chain
console.log('[1/4] Verifying initial baseline audit chain...');
const initialCheck = auditLogger.verifyAuditChain();
console.log('Initial verification result:', initialCheck);
assert.strictEqual(initialCheck.valid, true, 'Initial chain must be valid.');

// Phase 2: Append 3 sequential cryptographic events
console.log('\n[2/4] Appending 3 sequential chained events...');
const e1 = auditLogger.logEvent({
  action: 'AUTH_STEP1_SUCCESS',
  user: 'admin',
  ip: '192.168.1.100',
  userAgent: 'Mozilla/5.0 TestSuite',
  targetResource: '/api/auth/step1',
  payload: { method: 'password' }
});
console.log(` > Event 1 logged: [${e1.action}] id=${e1.id} prev=${e1.prevHash.slice(0, 8)}... hash=${e1.eventHash.slice(0, 8)}...`);

const e2 = auditLogger.logEvent({
  action: 'SERVICE_RESTART',
  user: 'admin',
  ip: '192.168.1.100',
  userAgent: 'Mozilla/5.0 TestSuite',
  targetResource: 'nginx.service',
  payload: { force: true }
});
console.log(` > Event 2 logged: [${e2.action}] id=${e2.id} prev=${e2.prevHash.slice(0, 8)}... hash=${e2.eventHash.slice(0, 8)}...`);

const e3 = auditLogger.logEvent({
  action: 'FILE_WRITE',
  user: 'admin',
  ip: '192.168.1.100',
  userAgent: 'Mozilla/5.0 TestSuite',
  targetResource: '/etc/systemd/system/nexuscontrol.service',
  payload: { size: 1024 }
});
console.log(` > Event 3 logged: [${e3.action}] id=${e3.id} prev=${e3.prevHash.slice(0, 8)}... hash=${e3.eventHash.slice(0, 8)}...`);

// Validate hash links
assert.strictEqual(e2.prevHash, e1.eventHash, 'Event 2 prevHash must equal Event 1 eventHash');
assert.strictEqual(e3.prevHash, e2.eventHash, 'Event 3 prevHash must equal Event 2 eventHash');

// Verify valid chain
const validCheck = auditLogger.verifyAuditChain();
console.log('\nAudit Chain Verification (Untampered):', validCheck);
assert.strictEqual(validCheck.valid, true, 'Chain must be completely valid.');
console.log('✓ Cryptographic SHA-256 chain links mathematically confirmed.');

// Phase 3: Tampering Test A - Mutate row payload/metadata
console.log('\n[3/4] SIMULATING UNAUTHORIZED DATABASE MUTATION (Tampering with Event 2 payload)...');
auditLogger.db.prepare("UPDATE audit_logs SET user = 'malicious_hacker' WHERE id = ?").run(e2.id);

const tamperedCheck1 = auditLogger.verifyAuditChain();
console.log('Audit Chain Verification After Payload Tampering:', tamperedCheck1);
assert.strictEqual(tamperedCheck1.valid, false, 'Tampered chain must be detected as invalid!');
assert.strictEqual(tamperedCheck1.logId, e2.id, 'Tamper detection must identify the exact manipulated event ID.');
console.log('✓ SUCCESS: Cryptographic engine detected tampered payload at record ID:', tamperedCheck1.logId);

// Restore Event 2 user
auditLogger.db.prepare("UPDATE audit_logs SET user = 'admin' WHERE id = ?").run(e2.id);
const restoredCheck = auditLogger.verifyAuditChain();
assert.strictEqual(restoredCheck.valid, true, 'Restoring original record restored validity.');
console.log('✓ State restored to valid.');

// Phase 4: Tampering Test B - Break hash chain link
console.log('\n[4/4] SIMULATING HASH CHAIN POINTER FORGERY (Tampering with Event 3 prev_hash)...');
auditLogger.db.prepare("UPDATE audit_logs SET prev_hash = '000000deadbeef' WHERE id = ?").run(e3.id);

const tamperedCheck2 = auditLogger.verifyAuditChain();
console.log('Audit Chain Verification After Pointer Tampering:', tamperedCheck2);
assert.strictEqual(tamperedCheck2.valid, false, 'Broken pointer chain must be detected as invalid!');
assert.strictEqual(tamperedCheck2.logId, e3.id, 'Tamper detection must pinpoint broken pointer on Event 3.');
console.log('✓ SUCCESS: Cryptographic engine caught forged previous hash link at record ID:', tamperedCheck2.logId);

// Restore Event 3 prev_hash
auditLogger.db.prepare("UPDATE audit_logs SET prev_hash = ? WHERE id = ?").run(e2.eventHash, e3.id);
const finalCheck = auditLogger.verifyAuditChain();
assert.strictEqual(finalCheck.valid, true, 'Chain is restored and valid again.');
console.log('✓ All integrity proofs passed with 100% mathematical precision.');

console.log('\n====================================================');
console.log('ALL AUDIT CHAIN TAMPER TESTS PASSED SUCCESSFULLY');
console.log('====================================================\n');
