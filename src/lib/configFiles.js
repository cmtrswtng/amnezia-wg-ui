'use strict';

const fs = require('node:fs/promises');
const { constants: fsConstants } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const readJsonConfig = async (filePath, fsApi = fs) => {
  let raw;
  try {
    raw = await fsApi.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { exists: false, raw: null, config: null };
    throw err;
  }
  try {
    return { exists: true, raw, config: JSON.parse(raw) };
  } catch (err) {
    const position = /position\s+(\d+)/i.exec(err.message)?.[1];
    const location = position === undefined ? 'location unavailable' : `at JSON position ${position}`;
    const parseError = new Error(`Cannot parse WireGuard configuration ${filePath}: ${location}`);
    parseError.name = 'WireGuardConfigParseError';
    throw parseError;
  }
};

const createBackupOnce = async (filePath, raw, fsApi = fs) => {
  try {
    await fsApi.writeFile(filePath, raw, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return 'created';
  } catch (err) {
    if (err.code === 'EEXIST') {
      try {
        const linkStats = await fsApi.lstat(filePath);
        if (linkStats.isSymbolicLink() || !linkStats.isFile()) {
          throw new Error('not a regular file');
        }
        let existing;
        if (typeof fsApi.open === 'function') {
          const noFollow = fsConstants.O_NOFOLLOW ?? 0;
          const handle = await fsApi.open(filePath, fsConstants.O_RDONLY | noFollow);
          try {
            const openedStats = await handle.stat();
            if (!openedStats.isFile()) throw new Error('not a regular file');
            existing = await handle.readFile('utf8');
          } finally {
            await handle.close();
          }
        } else {
          existing = await fsApi.readFile(filePath, 'utf8');
        }
        if (existing !== raw) {
          throw new Error(
            `Existing legacy WireGuard backup ${filePath} does not match the configuration being migrated; preserve both files and restore the intended AWG 1 state before retrying`,
          );
        }
        return 'exists';
      } catch (backupError) {
        if (backupError.message.startsWith('Existing legacy WireGuard backup')) throw backupError;
        throw new Error(
          `Existing legacy WireGuard backup ${filePath} is not a readable regular file; preserve it and fix its type or permissions before retrying`,
        );
      }
    }
    throw new Error(`Cannot create legacy WireGuard backup ${filePath}: ${err.message}`);
  }
};

const writeFileAtomic = async (filePath, contents, mode, fsApi = fs) => {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    await fsApi.writeFile(tempPath, contents, { encoding: 'utf8', mode, flag: 'wx' });
    await fsApi.rename(tempPath, filePath);
  } catch (err) {
    await fsApi.unlink(tempPath).catch(() => {});
    throw new Error(`Cannot atomically write ${filePath}: ${err.message}`);
  }
};

module.exports = {
  readJsonConfig,
  createBackupOnce,
  writeFileAtomic,
};
