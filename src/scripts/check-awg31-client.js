'use strict';

/* eslint-disable no-console */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { Resolver } = require('node:dns/promises');

async function main() {
  const profile = fs.readFileSync(0, 'utf8');
  fs.writeFileSync('/tmp/awgtest.conf', profile, { mode: 0o600 });
  const stripped = execFileSync('wg-quick', ['strip', '/tmp/awgtest.conf']);
  fs.writeFileSync('/tmp/awgtest-stripped.conf', stripped, { mode: 0o600 });
  execFileSync('amneziawg-go', ['awgtest'], { stdio: 'ignore' });
  execFileSync('wg', ['setconf', 'awgtest', '/tmp/awgtest-stripped.conf']);
  const address = /^Address = ([\d.]+)\//m.exec(profile)[1];
  execFileSync('ip', ['address', 'add', `${address}/32`, 'dev', 'awgtest']);
  execFileSync('ip', ['link', 'set', 'mtu', '1280', 'up', 'dev', 'awgtest']);
  execFileSync('ip', ['route', 'add', '10.8.0.1/32', 'dev', 'awgtest']);
  execFileSync('ping', ['-c', '3', '-W', '3', '-s', '1200', '10.8.0.1']);
  const handshake = execFileSync('wg', ['show', 'awgtest', 'latest-handshakes'], { encoding: 'utf8' }).trim().split(/\s+/)[1];
  assert(Number(handshake) > 0, 'No authenticated handshake');
  const transfer = execFileSync('wg', ['show', 'awgtest', 'transfer'], { encoding: 'utf8' }).trim().split(/\s+/);
  assert(Number(transfer[1]) > 0 && Number(transfer[2]) > 0, 'No bidirectional tunnel traffic');
  console.log('Real AWG 3.1 handshake and bidirectional large-packet traffic verified.');
  // Route these resolver requests through the tunnel rather than Docker's DNS.
  for (const ip of ['77.88.8.8', '77.88.8.1']) execFileSync('ip', ['route', 'add', `${ip}/32`, 'dev', 'awgtest']);
  const resolver = new Resolver({ timeout: 3000, tries: 1 });
  resolver.setServers(['77.88.8.8', '77.88.8.1']);
  const records = await resolver.resolve4('example.com');
  assert(records.length > 0, 'Yandex DNS returned no IPv4 records');
  console.log('Yandex DNS resolution through the encrypted tunnel verified.');
}
main().catch((err) => {
  console.error(err.message); process.exitCode = 1;
});
