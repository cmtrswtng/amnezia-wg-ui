'use strict';

/* global beforeEach, afterEach, describe, it, expect */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  readJsonConfig,
  createBackupOnce,
  writeFileAtomic,
} = require('../lib/configFiles');

describe('configuration file operations', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'awg2-config-'));
    const resolvedTempDir = path.resolve(tempDir);
    const resolvedTmpRoot = path.resolve(os.tmpdir());
    expect(resolvedTempDir.startsWith(resolvedTmpRoot)).toBe(true);
  });

  afterEach(async () => {
    const resolvedTempDir = path.resolve(tempDir);
    const resolvedTmpRoot = path.resolve(os.tmpdir());
    expect(resolvedTempDir.startsWith(resolvedTmpRoot)).toBe(true);
    await fs.rm(resolvedTempDir, { recursive: true, force: true });
  });

  it('returns null values for a missing configuration file', async () => {
    const missingPath = path.join(tempDir, 'missing.json');

    await expect(readJsonConfig(missingPath)).resolves.toEqual({
      exists: false,
      raw: null,
      config: null,
    });
  });

  it('returns raw text and parsed data for valid JSON', async () => {
    const filePath = path.join(tempDir, 'wg0.json');
    const raw = '{"server":{"address":"10.0.0.1/24"}}';
    await fs.writeFile(filePath, raw, 'utf8');

    await expect(readJsonConfig(filePath)).resolves.toEqual({
      exists: true,
      raw,
      config: { server: { address: '10.0.0.1/24' } },
    });
  });

  it('reports a safe parse location without exposing malformed configuration bytes', async () => {
    const filePath = path.join(tempDir, 'wg0.json');
    const secret = 'SENTINEL_PRIVATE_KEY';
    await fs.writeFile(filePath, `{"privateKey":"${secret}",broken}`, 'utf8');

    let parseError;
    try {
      await readJsonConfig(filePath);
    } catch (err) {
      parseError = err;
    }
    expect(parseError).toBeInstanceOf(Error);
    expect(parseError.name).toBe('WireGuardConfigParseError');
    expect(parseError.message).toContain(`Cannot parse WireGuard configuration ${filePath}`);
    expect(parseError.message).toMatch(/position|location unavailable/);
    expect(parseError.message).not.toContain(secret);
    expect(parseError.message).not.toContain('privateKey');
    expect(parseError.stack).not.toContain(secret);
    expect(parseError.stack).not.toContain('privateKey');
  });

  it('propagates non-ENOENT read errors', async () => {
    const readError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const fsApi = {
      readFile: async () => {
        throw readError;
      },
    };

    await expect(readJsonConfig(path.join(tempDir, 'wg0.json'), fsApi)).rejects.toBe(readError);
  });

  it('creates a backup exclusively and accepts an identical existing backup', async () => {
    const filePath = path.join(tempDir, 'wg0.json.bak');
    const raw = '{"legacy":true}';

    await expect(createBackupOnce(filePath, raw)).resolves.toBe('created');
    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe(raw);
    await expect(createBackupOnce(filePath, raw)).resolves.toBe('exists');
    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe(raw);
  });

  it('rejects a stale existing backup without overwriting it', async () => {
    const filePath = path.join(tempDir, 'wg0.json.bak');
    await fs.writeFile(filePath, '{"generation":1}', 'utf8');

    await expect(createBackupOnce(filePath, '{"generation":2}')).rejects.toThrow(
      `Existing legacy WireGuard backup ${filePath} does not match the configuration being migrated`,
    );
    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('{"generation":1}');
  });

  it('rejects an existing backup that is not a readable regular file', async () => {
    const backupDirectory = path.join(tempDir, 'wg0.json.bak');
    await fs.mkdir(backupDirectory);

    await expect(createBackupOnce(backupDirectory, '{}')).rejects.toThrow(
      `Existing legacy WireGuard backup ${backupDirectory} is not a readable regular file`,
    );
  });

  it('creates backups with mode 0600', async () => {
    const filePath = path.join(tempDir, 'wg0.json.bak');

    await createBackupOnce(filePath, '{}');

    const stats = await fs.stat(filePath);
    expect(stats.mode & 0o777).toBe(process.platform === 'win32' ? 0o666 : 0o600);
  });

  it('atomically replaces an existing file with the requested mode', async () => {
    const filePath = path.join(tempDir, 'wg0.json');
    await fs.writeFile(filePath, 'old', { mode: 0o644 });

    await writeFileAtomic(filePath, 'new', 0o600);

    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('new');
    const stats = await fs.stat(filePath);
    expect(stats.mode & 0o777).toBe(process.platform === 'win32' ? 0o666 : 0o600);
    await expect(fs.readdir(tempDir)).resolves.toEqual(['wg0.json']);
  });

  it('removes a temporary file when rename fails', async () => {
    const filePath = path.join(tempDir, 'wg0.json');
    const fsApi = {
      writeFile: fs.writeFile.bind(fs),
      rename: async () => {
        throw new Error('simulated rename failure');
      },
      unlink: fs.unlink.bind(fs),
    };

    await expect(writeFileAtomic(filePath, 'new', 0o600, fsApi)).rejects.toThrow(
      `Cannot atomically write ${filePath}: simulated rename failure`,
    );
    await expect(fs.readdir(tempDir)).resolves.toEqual([]);
  });
});
