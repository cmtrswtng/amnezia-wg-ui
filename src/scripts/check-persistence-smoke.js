'use strict';

/* eslint-disable no-console */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const StateStore = require('../lib/StateStore');

async function main() {
  let clients;
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch('http://127.0.0.1:51821/api/wireguard/client', { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        clients = await response.json(); break;
      }
    } catch { /* wait for the isolated server */ }
    await delay(200);
  }
  assert(clients, 'Server did not restart');
  const client = clients.find((entry) => entry.name === 'Smoke client');
  assert(client && client.transferRx > 0 && client.transferTx > 0, 'Traffic counters were lost');
  const store = new StateStore('/etc/wireguard/state.sqlite');
  const config = store.loadConfig();
  const current = { client, key: config.clients[client.id].privateKey, tags: config.clients[client.id].tags };
  const file = '/etc/wireguard/.smoke-before-restart.json';
  if (process.argv[2] === 'before') {
    fs.writeFileSync(file, JSON.stringify(current), { mode: 0o600 });
    console.log('Saved pre-restart counters and client identity.');
  } else {
    const before = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(client.id, before.client.id);
    assert.equal(current.key, before.key);
    assert.deepEqual(current.tags, before.tags);
    assert(client.transferRx >= before.client.transferRx, 'Receive total decreased after restart');
    assert(client.transferTx >= before.client.transferTx, 'Send total decreased after restart');
    console.log('SQLite retained clients, keys and traffic after restart/recreation.');
  }
}
main().catch((err) => {
  console.error(err.message); process.exitCode = 1;
});
