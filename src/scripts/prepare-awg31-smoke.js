'use strict';

/* eslint-disable no-console */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

async function main() {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:51821/api/wireguard/client', { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        ready = true; break;
      }
    } catch { /* interface may still be starting */ }
    await delay(200);
  }
  assert(ready, 'Server/interface did not become ready');
  const config = JSON.parse(fs.readFileSync('/etc/wireguard/wg0.json', 'utf8'));
  assert.equal(config.protocolVersion, '3.1');
  if (process.env.SMOKE_SEED_AWG2 === 'migrated') {
    const backup = JSON.parse(fs.readFileSync('/etc/wireguard/wg0.awg2.backup.json', 'utf8'));
    assert.equal(config.server.privateKey, backup.server.privateKey);
    assert.equal(config.server.publicKey, backup.server.publicKey);
    for (const [key, value] of Object.entries(backup.clients.preserved)) {
      assert.deepEqual(config.clients.preserved[key], value, `Migrated client field ${key}`);
    }
    assert.equal(config.clients.preserved.quotaCounterVersion, 1);
    assert.equal(config.clients.preserved.transferRxTotal, 0);
    assert.equal(config.clients.preserved.transferTxTotal, 0);
  }
  const created = await fetch('http://127.0.0.1:51821/api/wireguard/client', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Smoke client', tags: ['smoke'] }),
  });
  assert(created.ok, 'Client creation failed');
  const list = await (await fetch('http://127.0.0.1:51821/api/wireguard/client')).json();
  const client = list.find((entry) => entry.name === 'Smoke client');
  assert(client, 'Created client missing from the API');
  const response = await fetch(`http://127.0.0.1:51821/api/wireguard/client/${client.id}/configuration`);
  assert(response.ok, 'Profile download failed');
  const profile = await response.text();
  assert(profile.includes('AllowedIPs = 0.0.0.0/0\n'));
  assert(!profile.includes('::/0'));
  assert(profile.includes('DNS = 77.88.8.8, 77.88.8.1\n'));
  assert(profile.includes('MTU = 1280\n'));
  assert(profile.includes(`HeaderProtectionKey = ${config.server.headerProtectionKey}\n`));
  fs.writeFileSync('/tmp/awg31-client.conf', profile, { mode: 0o600 });
  console.log('Profile export, shared parameters and persisted state verified.');
}
main().catch((err) => {
  console.error(err.message); process.exitCode = 1;
});
