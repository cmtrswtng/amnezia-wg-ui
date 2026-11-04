'use strict';

/* global describe, it, expect, beforeEach, afterEach, vi */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const WireGuard = require('../lib/WireGuard');
const { createAwg31Parameters } = require('../lib/awg31Config');
const configFiles = require('../lib/configFiles');

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
    exec = vi.fn(async (command) => {
      if (command === 'wg show wg0 dump') {
        return `interface\n alice-public\tpsk\t(none)\t10.8.0.2/32\t0\t${current.rx}\t${current.tx}\t20-25`.replace('\n ', '\n');
      }
      return command.startsWith('wg gen') || command === 'wg pubkey' ? 'new-test-key' : '';
    });
    await fs.writeFile(path.join(dir, 'wg0.json'), JSON.stringify(fixture()));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
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
  it('applies a restored subnet, routes and NAT before reporting restore complete', async () => {
    const initial = fixture(); initial.server.address = '10.9.0.1'; initial.clients.alice.address = '10.9.0.2';
    await fs.writeFile(path.join(dir, 'wg0.json'), JSON.stringify(initial));
    const transitions = [];
    const originalExec = exec.getMockImplementation();
    exec.mockImplementation(async (command, options) => {
      if (command === 'wg-quick down wg0' || command === 'wg-quick up wg0') {
        transitions.push({ command, profile: await fs.readFile(path.join(dir, 'wg0.conf'), 'utf8') });
      }
      return originalExec(command, options);
    });
    const wg = new WireGuard({
      wgPath: dir, env: { WG_HOST: 'vpn.test', WG_DEFAULT_ADDRESS: '10.9.0.x' }, exec, interfaceEpoch: async () => epoch,
    });
    await wg.getConfig(); transitions.length = 0;
    await wg.restoreConfiguration(JSON.stringify(fixture()));
    expect(transitions.map((step) => step.command)).toEqual(['wg-quick down wg0', 'wg-quick up wg0']);
    expect(transitions[0].profile).toContain('Address = 10.9.0.1/24');
    expect(transitions[0].profile).toContain('-s 10.9.0.0/24');
    expect(transitions[1].profile).toContain('Address = 10.8.0.1/24');
    expect(transitions[1].profile).toContain('-s 10.8.0.0/24');
    await wg.createClient({ name: 'New client after restore' });
    const created = Object.values((await wg.getConfig()).clients).find((client) => client.name === 'New client after restore');
    expect(created.address).toBe('10.8.0.3');
  });
  it('brings the previous configuration back if a restored interface cannot start', async () => {
    const wg = instance(); await wg.getConfig();
    const changed = fixture(); changed.server.address = '10.9.0.1'; changed.clients.alice.address = '10.9.0.2';
    const originalExec = exec.getMockImplementation(); let rejectNextUp = true;
    exec.mockImplementation(async (command, options) => {
      if (command === 'wg-quick up wg0' && rejectNextUp) {
        rejectNextUp = false; throw new Error('restore interface failed');
      }
      return originalExec(command, options);
    });
    await expect(wg.restoreConfiguration(JSON.stringify(changed))).rejects.toThrow('restore interface failed');
    expect((await wg.getConfig()).server.address).toBe('10.8.0.1');
    expect(await fs.readFile(path.join(dir, 'wg0.conf'), 'utf8')).toContain('Address = 10.8.0.1/24');
  });
  it('waits for the restored interface before serving a concurrent client poll', async () => {
    const wg = instance(); await wg.getConfig();
    const changed = fixture(); changed.server.address = '10.9.0.1'; changed.clients.alice.address = '10.9.0.2';
    let startUp; let finishUp;
    const upStarted = new Promise((resolve) => {
      startUp = resolve;
    });
    const mayFinishUp = new Promise((resolve) => {
      finishUp = resolve;
    });
    const originalExec = exec.getMockImplementation();
    exec.mockImplementation(async (command, options) => {
      if (command === 'wg-quick up wg0') {
        startUp(); await mayFinishUp;
      }
      return originalExec(command, options);
    });
    const restoring = wg.restoreConfiguration(JSON.stringify(changed));
    await upStarted;
    let pollFinished = false;
    const polling = wg.getClients().then((clients) => {
      pollFinished = true; return clients;
    });
    await Promise.resolve(); expect(pollFinished).toBe(false);
    finishUp(); await restoring;
    expect((await polling)[0].address).toBe('10.9.0.2');
  });
  it('restarts the previous interface when down removes it and then fails in PostDown', async () => {
    const wg = instance(); await wg.getConfig();
    let live = true; let failDown = true;
    const originalExec = exec.getMockImplementation();
    exec.mockImplementation(async (command, options) => {
      if (command === 'wg-quick down wg0') {
        live = false;
        if (failDown) {
          failDown = false; throw new Error('PostDown failed');
        }
      }
      if (command === 'wg-quick up wg0') live = true;
      return originalExec(command, options);
    });
    const changed = fixture(); changed.server.address = '10.9.0.1';
    await expect(wg.restoreConfiguration(JSON.stringify(changed))).rejects.toThrow('PostDown failed');
    expect(live).toBe(true);
    expect((await wg.getConfig()).server.address).toBe('10.8.0.1');
  });
  it('finishes an in-flight configuration save before applying an imported subnet', async () => {
    const wg = instance(); await wg.getConfig();
    let saveReached; let releaseSave;
    const savingFile = new Promise((resolve) => {
      saveReached = resolve;
    });
    const maySave = new Promise((resolve) => {
      releaseSave = resolve;
    });
    const write = configFiles.writeFileAtomic; let pauseNextConf = true;
    vi.spyOn(configFiles, 'writeFileAtomic').mockImplementation(async (file, ...args) => {
      if (file.endsWith('wg0.conf') && pauseNextConf) {
        pauseNextConf = false; saveReached(); await maySave;
      }
      return write(file, ...args);
    });
    const saving = wg.updateClientName({ clientId: 'alice', name: 'Renamed before import' });
    await savingFile;
    const changed = fixture(); changed.server.address = '10.9.0.1'; changed.clients.alice.address = '10.9.0.2';
    let restoreFinished = false;
    const restoring = wg.restoreConfiguration(JSON.stringify(changed)).then(() => {
      restoreFinished = true;
    });
    // Leave the older atomic write pending while the competing restore runs.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const finishedBeforeSave = restoreFinished;
    releaseSave(); await Promise.all([saving, restoring]);
    expect(finishedBeforeSave).toBe(false);
    expect((await wg.getConfig()).server.address).toBe('10.9.0.1');
    expect(wg.store.loadConfig().server.address).toBe('10.9.0.1');
    expect(await fs.readFile(path.join(dir, 'wg0.conf'), 'utf8')).toContain('Address = 10.9.0.1/24');
  });
});
