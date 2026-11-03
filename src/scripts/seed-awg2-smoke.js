'use strict';

// Runs only in an isolated smoke container, never against a deployment volume.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createAwg2Parameters } = require('../lib/awgConfig');

if (process.env.SMOKE_SEED_AWG2 === 'migrated' && !fs.existsSync('/etc/wireguard/state.sqlite')) {
  const key = () => execFileSync('wg', ['genkey'], { encoding: 'utf8' }).trim();
  const pub = (privateKey) => execFileSync('wg', ['pubkey'], { input: privateKey, encoding: 'utf8' }).trim();
  const serverKey = key();
  const clientKey = key();
  const config = {
    protocolVersion: 2,
    server: {
      ...createAwg2Parameters({ env: {} }),
      privateKey: serverKey,
      publicKey: pub(serverKey),
      address: '10.8.0.1',
    },
    clients: {
      preserved: {
        name: 'Existing client',
        enabled: true,
        address: '10.8.0.2',
        privateKey: clientKey,
        publicKey: pub(clientKey),
        preSharedKey: key(),
        tags: ['migration'],
        createdAt: new Date().toISOString(),
        expiredAt: null,
        quotaBytes: 1024 ** 3,
        quotaCycleDays: 30,
        quotaCycleStartAt: new Date().toISOString(),
        quotaUsedBytes: 1234,
        oneTimeLink: 'test-only-preserved-link',
      },
    },
  };
  fs.mkdirSync('/etc/wireguard', { recursive: true });
  fs.writeFileSync('/etc/wireguard/wg0.json', JSON.stringify(config), { mode: 0o600, flag: 'wx' });
}
