'use strict';

/* global describe, it, expect, beforeEach, afterEach */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const StateStore = require('../lib/StateStore');

const fixture = () => ({
  protocolVersion: '3.1',
  server: { privateKey: 'server-secret', address: '10.8.0.1' },
  clients: {
    alice: {
      name: 'Alice', publicKey: 'alice-public', privateKey: 'alice-secret', enabled: true, tags: ['work'], quotaUsedBytes: 123, expiredAt: null,
    },
  },
  extra: { retained: true },
});
describe('SQLite state and traffic', () => {
  let dir; let file;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awg-state-')); file = path.join(dir, 'state.sqlite');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  it('preserves all server/client metadata across repository instances', () => {
    const store = new StateStore(file);
    expect(store.loadConfig()).toBeNull();
    store.saveConfig(fixture());
    expect(new StateStore(file).loadConfig()).toMatchObject(fixture());
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
  it('accumulates totals once and retains cursors across process restarts', () => {
    const store = new StateStore(file); store.saveConfig(fixture());
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 100, tx: 50 }]);
    new StateStore(file).recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 100, tx: 50 }]);
    new StateStore(file).recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 130, tx: 70 }]);
    expect(store.getTraffic().alice).toMatchObject({ rx: 130, tx: 70 });
  });
  it('adds post-restart traffic even when new raw counters already exceed old ones', () => {
    const store = new StateStore(file); store.saveConfig(fixture());
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 100, tx: 50 }]);
    store.recordTraffic('boot:2', [{ publicKey: 'alice-public', rx: 300, tx: 200 }]);
    expect(store.getTraffic().alice).toMatchObject({ rx: 400, tx: 250 });
  });
  it('handles resets independently per direction and ignores unknown peers', () => {
    const store = new StateStore(file); store.saveConfig(fixture());
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 100, tx: 50 }]);
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 10, tx: 70 }, { publicKey: 'unknown', rx: 999, tx: 999 }]);
    expect(store.getTraffic().alice).toMatchObject({ rx: 110, tx: 70 });
    expect(Object.keys(store.getTraffic())).toEqual(['alice']);
  });
  it('preserves totals when client metadata or quota usage changes', () => {
    const store = new StateStore(file); const config = fixture(); store.saveConfig(config);
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 100, tx: 50 }]);
    config.clients.alice.name = 'Renamed'; config.clients.alice.quotaUsedBytes = 0;
    store.saveConfig(config);
    expect(store.loadConfig().clients.alice).toMatchObject({
      name: 'Renamed', quotaUsedBytes: 0, transferRxTotal: 100, transferTxTotal: 50,
    });
  });
  it('resets peer cursors on re-enable without losing accumulated totals', () => {
    const store = new StateStore(file); const config = fixture(); store.saveConfig(config);
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 100, tx: 50 }]);
    config.clients.alice.enabled = false; store.saveConfig(config);
    config.clients.alice.enabled = true; store.saveConfig(config);
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 200, tx: 100 }]);
    expect(store.getTraffic().alice).toMatchObject({ rx: 300, tx: 150 });
  });
  it('removes deleted clients and their traffic in the same transaction', () => {
    const store = new StateStore(file); const config = fixture(); store.saveConfig(config);
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 100, tx: 50 }]);
    config.clients = {}; store.saveConfig(config);
    expect(store.loadConfig().clients).toEqual({}); expect(store.getTraffic()).toEqual({});
  });
  it('exports and restores totals without counting existing kernel traffic twice', () => {
    const store = new StateStore(file); store.saveConfig(fixture());
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 100, tx: 50 }]);
    const exported = store.loadConfig();
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 130, tx: 70 }]);
    store.saveConfig(exported, { replaceTraffic: true });
    store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 140, tx: 80 }]);
    expect(store.getTraffic().alice).toMatchObject({ rx: 110, tx: 60 });
  });
  it('rolls back malformed traffic samples rather than committing a partial batch', () => {
    const store = new StateStore(file); store.saveConfig(fixture());
    expect(() => store.recordTraffic('boot:1', [{ publicKey: 'alice-public', rx: 100, tx: 50 }, { publicKey: 'alice-public', rx: -1, tx: 50 }])).toThrow('counter');
    expect(store.getTraffic().alice).toMatchObject({ rx: 0, tx: 0 });
  });
  it('rejects corrupt databases rather than replacing them with a fresh state', () => {
    fs.writeFileSync(file, 'corrupt');
    expect(() => new StateStore(file)).toThrow(); expect(fs.readFileSync(file, 'utf8')).toBe('corrupt');
  });
});
