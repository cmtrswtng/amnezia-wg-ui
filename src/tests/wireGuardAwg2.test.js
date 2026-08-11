'use strict';

/* global afterEach, beforeEach, describe, it, expect, vi */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const WireGuard = require('../lib/WireGuard');
const fileHelpers = require('../lib/configFiles');

const sequentialRandom = () => {
  const offsets = new Map();
  return (min, maxExclusive) => {
    const key = `${min}:${maxExclusive}`;
    const offset = offsets.get(key) ?? 0;
    offsets.set(key, offset + 1);
    return min + (offset % (maxExclusive - min));
  };
};

const createExec = () => vi.fn(async (command) => (
  command.includes('genkey') ? 'private-key' : 'public-key'
));

const validConfig = () => ({
  protocolVersion: 2,
  server: {
    privateKey: 'private-key',
    publicKey: 'public-key',
    address: '10.8.0.1',
    jc: 4,
    jmin: 64,
    jmax: 512,
    s1: 15,
    s2: 16,
    s3: 17,
    s4: 8,
    h1: 101,
    h2: 102,
    h3: 103,
    h4: 104,
    i1: '',
    i2: '',
    i3: '',
    i4: '',
    i5: '',
  },
  clients: {},
});

describe('WireGuard AWG 2 startup migration', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'awg2-wireguard-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('accepts deterministic startup dependencies without exposing keys in command logs', () => {
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir,
      env: {},
      exec,
      randomInt: sequentialRandom(),
    });

    expect(wg.wgPath).toBe(tempDir);
    expect(wg.env).toEqual({});
    expect(wg.exec).toBe(exec);
    expect(wg.randomInt).toBeTypeOf('function');
  });

  it('creates and persists an AWG 2 configuration for a fresh install', async () => {
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir,
      env: { WG_HOST: 'vpn.example.test' },
      exec,
      randomInt: sequentialRandom(),
    });

    const config = await wg.getConfig();

    expect(config).toMatchObject({
      protocolVersion: 2,
      server: {
        privateKey: 'private-key', publicKey: 'public-key', s3: 17, s4: 8,
      },
    });
    await expect(fs.readFile(path.join(tempDir, 'wg0.json'), 'utf8'))
      .resolves.toContain('"protocolVersion": 2');
    expect(exec).toHaveBeenNthCalledWith(2, 'wg pubkey', {
      input: 'private-key',
      log: 'wg pubkey',
    });
    const [command, options] = exec.mock.calls[1];
    expect(command).not.toContain('private-key');
    expect(options.log).not.toContain('private-key');
  });

  it('shares one complete initialization sequence between concurrent callers', async () => {
    const writeFileAtomic = vi.spyOn(fileHelpers, 'writeFileAtomic');
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir,
      env: { WG_HOST: 'vpn.example.test' },
      exec,
      randomInt: sequentialRandom(),
    });

    const [first, second] = await Promise.all([wg.getConfig(), wg.getConfig()]);

    expect(first).toBe(second);
    expect(exec.mock.calls.filter(([command]) => command === 'wg genkey')).toHaveLength(1);
    expect(exec.mock.calls.filter(([command]) => command === 'wg pubkey')).toHaveLength(1);
    expect(writeFileAtomic).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls.filter(([command]) => command === 'wg-quick down wg0')).toHaveLength(1);
    expect(exec.mock.calls.filter(([command]) => command === 'wg-quick up wg0')).toHaveLength(1);
    expect(exec.mock.calls.filter(([command]) => command === 'wg syncconf wg0 <(wg-quick strip wg0)')).toHaveLength(1);
  });

  it('derives client public keys through stdin without exposing the private key in command options', async () => {
    const exec = vi.fn(async (command) => {
      if (command === 'wg genkey') return 'client-private-key';
      if (command === 'wg pubkey') return 'client-public-key';
      return 'client-pre-shared-key';
    });
    const wg = new WireGuard({
      wgPath: tempDir,
      env: { WG_HOST: 'vpn.example.test' },
      exec,
    });
    const config = validConfig();
    wg.getConfig = async () => config;
    wg.saveConfig = vi.fn();

    await wg.createClient({ name: 'Alice' });

    expect(exec).toHaveBeenNthCalledWith(2, 'wg pubkey', {
      input: 'client-private-key',
      log: 'wg pubkey',
    });
    const [command, options] = exec.mock.calls[1];
    expect(command).not.toContain('client-private-key');
    expect(options.log).not.toContain('client-private-key');
  });

  it('rejects corrupt JSON before generating keys, persisting files, or changing the interface', async () => {
    await fs.writeFile(path.join(tempDir, 'wg0.json'), '{broken', 'utf8');
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec, randomInt: sequentialRandom(),
    });

    await expect(wg.getConfig()).rejects.toThrow('Cannot parse WireGuard configuration');
    expect(exec).not.toHaveBeenCalled();
    await expect(fs.readFile(path.join(tempDir, 'wg0.json'), 'utf8')).resolves.toBe('{broken');
  });

  it('backs up and migrates legacy state once while preserving client metadata', async () => {
    const legacy = {
      server: {
        privateKey: 'legacy-private',
        publicKey: 'legacy-public',
        address: '10.8.0.1',
      },
      clients: {
        alice: {
          name: 'Alice',
          enabled: true,
          address: '10.8.0.2',
          publicKey: 'alice-public',
          tags: ['team'],
          oneTimeLink: 'opaque',
          quotaBytes: 100,
        },
      },
      extra: { preserved: true },
    };
    const raw = JSON.stringify(legacy, null, 2);
    await fs.writeFile(path.join(tempDir, 'wg0.json'), raw, 'utf8');

    const first = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec: createExec(), randomInt: sequentialRandom(),
    });
    const config = await first.getConfig();
    const backupPath = path.join(tempDir, 'wg0.awg1.backup.json');

    expect(config.clients).toEqual(legacy.clients);
    expect(config.extra).toEqual(legacy.extra);
    expect(config.protocolVersion).toBe(2);
    expect(config.server).toMatchObject({ privateKey: 'legacy-private', s3: 17, s4: 8 });
    await expect(fs.readFile(backupPath, 'utf8')).resolves.toBe(raw);
    const backupStats = await fs.stat(backupPath);
    expect(backupStats.mode & 0o777).toBe(process.platform === 'win32' ? 0o666 : 0o600);

    const activeBytes = await fs.readFile(path.join(tempDir, 'wg0.json'), 'utf8');
    const second = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec: createExec(), randomInt: () => 99,
    });
    await second.getConfig();
    await expect(fs.readFile(backupPath, 'utf8')).resolves.toBe(raw);
    await expect(fs.readFile(path.join(tempDir, 'wg0.json'), 'utf8')).resolves.toBe(activeBytes);
  });

  it('rejects unsupported versions before any interface command', async () => {
    await fs.writeFile(path.join(tempDir, 'wg0.json'), JSON.stringify({ protocolVersion: 3 }), 'utf8');
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec, randomInt: sequentialRandom(),
    });

    await expect(wg.getConfig()).rejects.toThrow('Unsupported AmneziaWG protocol version: 3');
    expect(exec).not.toHaveBeenCalled();
  });

  it.each([0, 1])('does not run interface commands when atomic write %i fails', async (failureIndex) => {
    const writeFileAtomic = vi.spyOn(fileHelpers, 'writeFileAtomic').mockImplementation(async () => {
      if (writeFileAtomic.mock.calls.length === failureIndex + 1) {
        throw new Error('disk full');
      }
    });
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec, randomInt: sequentialRandom(),
    });

    await expect(wg.getConfig()).rejects.toThrow('disk full');
    expect(writeFileAtomic).toHaveBeenCalledTimes(failureIndex + 1);
    expect(exec.mock.calls.map(([command]) => command)).not.toContain('wg-quick down wg0');
    expect(exec.mock.calls.map(([command]) => command)).not.toContain('wg-quick up wg0');
    expect(exec.mock.calls.map(([command]) => command)).not.toContain('wg syncconf wg0 <(wg-quick strip wg0)');
  });

  it('validates before atomically writing both configuration files', async () => {
    const writeFileAtomic = vi.spyOn(fileHelpers, 'writeFileAtomic').mockResolvedValue();
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec: createExec(),
    });

    await wg.__saveConfig(validConfig());

    expect(writeFileAtomic).toHaveBeenNthCalledWith(
      1, path.join(tempDir, 'wg0.json'), expect.any(String), 0o600,
    );
    expect(writeFileAtomic).toHaveBeenNthCalledWith(
      2, path.join(tempDir, 'wg0.conf'), expect.any(String), 0o600,
    );
  });
});
