'use strict';

/* global describe, it, expect, beforeEach, afterEach, vi */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const WireGuard = require('../lib/WireGuard');
const { createAwg31Parameters } = require('../lib/awg31Config');

const fixture = () => ({
  protocolVersion: '3.1',
  server: {
    ...createAwg31Parameters({ env: {} }), privateKey: 'server-private', publicKey: 'server-public', address: '10.8.0.1',
  },
  clients: {
    alice: {
      name: 'Alice', id: 'alice', address: '10.8.0.2', publicKey: 'alice-public', privateKey: 'alice-private', enabled: true, tags: ['family'], expiredAt: null, quotaUsedBytes: 0,
    },
  },
});
describe('persistent WireGuard state', () => {
  let dir; let current; let epoch; let exec;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'awg-persistence-'));
    current = { rx: 0, tx: 0 }; epoch = 'boot:1';
    exec = vi.fn(async (command) => (command === 'wg show wg0 dump'
      ? `interface\n alice-public\tpsk\t(none)\t10.8.0.2/32\t0\t${current.rx}\t${current.tx}\t20-25`.replace('\n ', '\n') : ''));
    await fs.writeFile(path.join(dir, 'wg0.json'), JSON.stringify(fixture()));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const instance = () => new WireGuard({
    wgPath: dir, env: { WG_HOST: 'vpn.test' }, exec, interfaceEpoch: async () => epoch,
  });

  it('imports clients to SQLite once and prefers the database over a stale JSON snapshot', async () => {
    const wg = instance(); await wg.getConfig();
    expect(await fs.stat(path.join(dir, 'state.sqlite'))).toBeTruthy();
    const backup = JSON.parse(await fs.readFile(path.join(dir, 'wg0.pre-sqlite.backup.json'), 'utf8'));
    expect(backup.clients.alice.name).toBe('Alice');
    await wg.updateClientName({ clientId: 'alice', name: 'Renamed' });
    await fs.writeFile(path.join(dir, 'wg0.json'), JSON.stringify(fixture()));
    const config = await instance().getConfig();
    expect(config.clients.alice.name).toBe('Renamed');
    expect(config.clients.alice.privateKey).toBe('alice-private');
  });
  it('keeps lifetime traffic across process/interface restarts and counts new traffic once', async () => {
    const first = instance(); await first.getConfig();
    current = { rx: 100, tx: 50 };
    expect((await first.getClients())[0]).toMatchObject({ transferRx: 100, transferTx: 50 });
    epoch = 'boot:2'; current = { rx: 10, tx: 5 };
    const second = instance(); await second.getConfig();
    expect((await second.getClients())[0]).toMatchObject({ transferRx: 110, transferTx: 55 });
    expect((await second.getClients())[0]).toMatchObject({ transferRx: 110, transferTx: 55 });
  });
  it('collects a final sample on shutdown and exports/restores totals', async () => {
    const wg = instance(); await wg.getConfig();
    current = { rx: 100, tx: 50 }; await wg.Shutdown();
    const backup = JSON.parse(await wg.backupConfiguration());
    expect(backup.clients.alice).toMatchObject({ transferRxTotal: 100, transferTxTotal: 50 });
    current = { rx: 150, tx: 70 }; await wg.getClients();
    await wg.restoreConfiguration(JSON.stringify(backup));
    current = { rx: 160, tx: 80 };
    expect((await wg.getClients())[0]).toMatchObject({ transferRx: 110, transferTx: 60 });
  });
  it('deduplicates concurrent polling so the same counter change is never charged twice', async () => {
    const wg = instance(); await wg.getConfig(); current = { rx: 100, tx: 50 };
    await Promise.all([wg.getClients(), wg.getClients(), wg.captureTraffic()]);
    expect((await wg.getClients())[0]).toMatchObject({ transferRx: 100, transferTx: 50 });
  });
  const legacyQuota = async () => {
    const config = fixture();
    Object.assign(config.clients.alice, {
      quotaBytes: 100000,
      quotaCycleDays: 30,
      quotaCycleStartAt: new Date().toISOString(),
      quotaUsedBytes: 500,
      quotaLastRx: 1000,
      quotaLastTx: 500,
    });
    await fs.writeFile(path.join(dir, 'wg0.json'), JSON.stringify(config));
    return config;
  };
  it('converts legacy quota cursors when upgrading after the old interface disappeared', async () => {
    await legacyQuota();
    exec.mockImplementationOnce(async () => {
      throw new Error('No such device');
    });
    const wg = instance(); await wg.getConfig();
    current = { rx: 2000, tx: 1000 }; await wg.cronJobEveryMinute();
    expect((await wg.getConfig()).clients.alice.quotaUsedBytes).toBe(3500);
    epoch = 'boot:2'; current = { rx: 0, tx: 0 };
    const restarted = instance(); await restarted.getConfig();
    current = { rx: 100, tx: 50 }; await restarted.cronJobEveryMinute();
    expect((await restarted.getConfig()).clients.alice.quotaUsedBytes).toBe(3650);
  });
  it('charges pending legacy traffic once before converting a still-running interface', async () => {
    await legacyQuota(); current = { rx: 1200, tx: 600 };
    const wg = instance(); await wg.getConfig();
    expect((await wg.getConfig()).clients.alice.quotaUsedBytes).toBe(800);
    epoch = 'boot:2'; current = { rx: 50, tx: 25 }; await wg.cronJobEveryMinute();
    expect((await wg.getConfig()).clients.alice.quotaUsedBytes).toBe(875);
  });
  it('restores legacy quota usage without comparing old raw cursors to new totals', async () => {
    const legacy = await legacyQuota();
    const wg = instance(); await wg.getConfig(); current = { rx: 100, tx: 50 };
    await wg.restoreConfiguration(JSON.stringify(legacy));
    current = { rx: 200, tx: 100 }; await wg.cronJobEveryMinute();
    expect((await wg.getConfig()).clients.alice.quotaUsedBytes).toBe(650);
  });
  it('writes compatibility snapshots with the latest persisted totals', async () => {
    const wg = instance(); await wg.getConfig(); current = { rx: 100, tx: 50 };
    await wg.updateClientName({ clientId: 'alice', name: 'Renamed' });
    const snapshot = JSON.parse(await fs.readFile(path.join(dir, 'wg0.json'), 'utf8'));
    expect(snapshot.clients.alice).toMatchObject({ name: 'Renamed', transferRxTotal: 100, transferTxTotal: 50 });
  });
});
