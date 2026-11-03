'use strict';

/* global afterEach, beforeEach, describe, it, expect, vi */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const debug = require('debug');

const WireGuard = require('../lib/WireGuard');
const fileHelpers = require('../lib/configFiles');
const { createAwg31Parameters, renderAwg31InterfaceLines } = require('../lib/awg31Config');

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
  protocolVersion: '3.1',
  server: {
    ...createAwg31Parameters({ env: {}, randomInt: (min) => min }),
    privateKey: 'private-key',
    publicKey: 'public-key',
    address: '10.8.0.1',
  },
  clients: {},
});

const profileConfig = (overrides = {}) => ({
  ...validConfig(),
  server: {
    ...validConfig().server,
    privateKey: 'server-private-key',
    publicKey: 'server-public-key',
    ...overrides.server,
  },
  clients: {
    alice: {
      name: 'Alice',
      enabled: true,
      address: '10.8.0.2',
      privateKey: 'client-private-key',
      publicKey: 'client-public-key',
      preSharedKey: 'client-preshared-key',
      ...overrides.clients?.alice,
    },
    ...overrides.clients,
  },
});

describe('WireGuard AWG 3.1 startup migration', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'awg2-wireguard-'));
  });

  afterEach(async () => {
    debug.disable();
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

  it('creates and persists an AWG 3.1 configuration for a fresh install', async () => {
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir,
      env: { WG_HOST: 'vpn.example.test' },
      exec,
      randomInt: sequentialRandom(),
    });

    const config = await wg.getConfig();

    expect(config).toMatchObject({
      protocolVersion: '3.1',
      server: {
        privateKey: 'private-key', publicKey: 'public-key', s3: 16, s4: 16,
      },
    });
    await expect(fs.readFile(path.join(tempDir, 'wg0.json'), 'utf8'))
      .resolves.toContain('"protocolVersion": "3.1"');
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

  it.each([
    ['legacy server array', { server: [], clients: {} }],
    ['legacy malformed client', {
      server: { privateKey: 'private', publicKey: 'public', address: '10.8.0.1' },
      clients: { alice: [] },
    }],
    ['v2 missing server address', {
      ...validConfig(), server: { ...validConfig().server, address: undefined },
    }],
    ['v2 malformed client', { ...validConfig(), clients: { alice: null } }],
  ])('rejects malformed persisted state with no backup, active write, or interface command: %s', async (description, malformed) => {
    const activePath = path.join(tempDir, 'wg0.json');
    const raw = JSON.stringify(malformed);
    await fs.writeFile(activePath, raw, 'utf8');
    const backup = vi.spyOn(fileHelpers, 'createBackupOnce');
    const write = vi.spyOn(fileHelpers, 'writeFileAtomic');
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec, randomInt: sequentialRandom(),
    });

    await expect(wg.getConfig()).rejects.toThrow(/Invalid (legacy|AWG 3\.1) WireGuard configuration/);
    expect(backup).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    await expect(fs.readFile(activePath, 'utf8')).resolves.toBe(raw);
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
          privateKey: 'alice-private',
          publicKey: 'alice-public',
          preSharedKey: 'alice-preshared',
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

    expect(config.clients).toMatchObject(legacy.clients);
    expect(Object.keys(config.clients)).toEqual(Object.keys(legacy.clients));
    expect(config.extra).toEqual(legacy.extra);
    expect(config.protocolVersion).toBe('3.1');
    expect(config.server).toMatchObject({
      privateKey: legacy.server.privateKey,
      publicKey: legacy.server.publicKey,
      address: legacy.server.address,
      s3: 16,
      s4: 16,
    });
    expect(config.clients.alice).toMatchObject({
      privateKey: legacy.clients.alice.privateKey,
      publicKey: legacy.clients.alice.publicKey,
      preSharedKey: legacy.clients.alice.preSharedKey,
    });
    await expect(fs.readFile(backupPath, 'utf8')).resolves.toBe(raw);
    const backupStats = await fs.stat(backupPath);
    expect(backupStats.mode & 0o777).toBe(process.platform === 'win32' ? 0o666 : 0o600);

    const activeBytes = await fs.readFile(path.join(tempDir, 'wg0.json'), 'utf8');
    const second = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec: createExec(), randomInt: () => 99,
    });
    await second.getConfig();
    await expect(fs.readFile(backupPath, 'utf8')).resolves.toBe(raw);
    const restartedConfig = JSON.parse(await fs.readFile(path.join(tempDir, 'wg0.json'), 'utf8'));
    expect(restartedConfig).toMatchObject(JSON.parse(activeBytes));
  });

  it('continues a re-upgrade only when the existing legacy backup is byte-identical', async () => {
    const legacy = {
      server: { privateKey: 'private', publicKey: 'public', address: '10.8.0.1' },
      clients: {},
    };
    const raw = JSON.stringify(legacy, null, 2);
    await fs.writeFile(path.join(tempDir, 'wg0.json'), raw, 'utf8');
    await fs.writeFile(path.join(tempDir, 'wg0.awg1.backup.json'), raw, 'utf8');
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec, randomInt: sequentialRandom(),
    });

    await expect(wg.getConfig()).resolves.toMatchObject({ protocolVersion: '3.1' });
    await expect(fs.readFile(path.join(tempDir, 'wg0.awg1.backup.json'), 'utf8')).resolves.toBe(raw);
    expect(exec).toHaveBeenCalledWith('wg-quick up wg0');
  });

  it('aborts a re-upgrade with a stale backup before active writes or interface commands', async () => {
    const legacy = {
      server: { privateKey: 'private', publicKey: 'public', address: '10.8.0.1' },
      clients: {},
    };
    const activePath = path.join(tempDir, 'wg0.json');
    const raw = JSON.stringify(legacy);
    await fs.writeFile(activePath, raw, 'utf8');
    await fs.writeFile(path.join(tempDir, 'wg0.awg1.backup.json'), '{"older":true}', 'utf8');
    const write = vi.spyOn(fileHelpers, 'writeFileAtomic');
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec, randomInt: sequentialRandom(),
    });

    await expect(wg.getConfig()).rejects.toThrow('does not match the configuration being migrated');
    expect(write).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    await expect(fs.readFile(activePath, 'utf8')).resolves.toBe(raw);
  });

  it('aborts migration when the legacy backup path is a symlink to active state', async ({ skip }) => {
    const legacy = {
      server: { privateKey: 'private', publicKey: 'public', address: '10.8.0.1' },
      clients: {},
    };
    const activePath = path.join(tempDir, 'wg0.json');
    const backupPath = path.join(tempDir, 'wg0.awg1.backup.json');
    const raw = JSON.stringify(legacy);
    await fs.writeFile(activePath, raw, 'utf8');
    try {
      await fs.symlink(activePath, backupPath, 'file');
    } catch (err) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(err.code)) skip(`symlinks unavailable: ${err.code}`);
      throw err;
    }
    const write = vi.spyOn(fileHelpers, 'writeFileAtomic');
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec, randomInt: sequentialRandom(),
    });

    await expect(wg.getConfig()).rejects.toThrow('is not a readable regular file');
    expect(write).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    await expect(fs.readFile(activePath, 'utf8')).resolves.toBe(raw);
    await expect(fs.readlink(backupPath)).resolves.toBe(activePath);
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

  it('renders matching complete AWG 3.1 framing in server and client profiles', async () => {
    const config = profileConfig();
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec: createExec(),
    });
    wg.getConfig = async () => config;
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    debug.enable('WireGuard');

    await wg.__saveConfig(config);
    const serverProfile = await fs.readFile(path.join(tempDir, 'wg0.conf'), 'utf8');
    const clientProfile = await wg.getClientConfiguration({ clientId: 'alice' });
    const framing = renderAwg31InterfaceLines(config.server);

    expect(serverProfile).toContain(framing);
    expect(clientProfile).toContain(framing);
    expect(serverProfile).not.toContain('I2 =');
    expect(clientProfile).not.toContain('I2 =');
    expect(serverProfile).toContain('PrivateKey = server-private-key');
    expect(serverProfile).not.toContain('client-private-key');
    expect(clientProfile).toContain('PrivateKey = client-private-key');
    expect(clientProfile).not.toContain('server-private-key');
    const logged = stderr.mock.calls.flat().join(' ');
    expect(logged).toContain('WireGuard');
    expect(logged).not.toContain('server-private-key');
    expect(logged).not.toContain('client-private-key');

    config.server.i2 = '<b 0x02>';
    await wg.__saveConfig(config);
    const serverWithI2 = await fs.readFile(path.join(tempDir, 'wg0.conf'), 'utf8');
    const clientWithI2 = await wg.getClientConfiguration({ clientId: 'alice' });
    const framingWithI2 = renderAwg31InterfaceLines(config.server);

    expect(serverWithI2).toContain(framingWithI2);
    expect(clientWithI2).toContain(framingWithI2);
    expect(serverWithI2).toContain('I2 = <b 0x02>');
    expect(clientWithI2).toContain('I2 = <b 0x02>');
  });

  it('rejects malformed restored v2 data before active writes or interface commands', async () => {
    const write = vi.spyOn(fileHelpers, 'writeFileAtomic');
    const exec = createExec();
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec,
    });

    await expect(wg.restoreConfiguration(JSON.stringify({
      ...validConfig(), clients: { alice: [] },
    }))).rejects.toThrow('Invalid AWG 3.1 WireGuard configuration');
    expect(write).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('returns a stable client profile for repeated downloads', async () => {
    const config = profileConfig({ server: { i2: '<b 0x02>' } });
    const wg = new WireGuard({
      wgPath: tempDir, env: { WG_HOST: 'vpn.example.test' }, exec: createExec(),
    });
    wg.getConfig = async () => config;

    const first = await wg.getClientConfiguration({ clientId: 'alice' });
    const second = await wg.getClientConfiguration({ clientId: 'alice' });

    expect(second).toBe(first);
  });
});
