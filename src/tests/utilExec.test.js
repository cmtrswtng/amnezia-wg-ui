'use strict';

/* global afterEach, describe, it, expect, vi */

const childProcess = require('child_process');
const Util = require('../lib/Util');

describe('Util.exec', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');

  afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
    vi.restoreAllMocks();
  });

  it('sends sensitive input over stdin without putting it in the command or log', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const stdin = { end: vi.fn() };
    const exec = vi.spyOn(childProcess, 'exec').mockImplementation((command, options, callback) => {
      callback(null, 'public-key');
      return { stdin };
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(Util.exec('wg pubkey', {
      input: 'private-key',
      log: 'wg pubkey',
    })).resolves.toBe('public-key');

    expect(exec).toHaveBeenCalledWith('wg pubkey', { shell: 'bash' }, expect.any(Function));
    expect(stdin.end).toHaveBeenCalledWith('private-key');
    expect(exec.mock.calls.flat().join(' ')).not.toContain('private-key');
    expect(log.mock.calls.flat().join(' ')).not.toContain('private-key');
  });

  it('does not put stdin input in command errors', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const commandError = new Error('Command failed: wg pubkey');
    const stdin = { end: vi.fn() };
    const exec = vi.spyOn(childProcess, 'exec').mockImplementation((command, options, callback) => {
      callback(commandError, '');
      return { stdin };
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    let error;
    try {
      await Util.exec('wg pubkey', { input: 'private-key', log: 'wg pubkey' });
    } catch (err) {
      error = err;
    }

    expect(error.message).toContain('wg pubkey');
    expect(error.message).not.toContain('private-key');
    expect(exec.mock.calls.flat().join(' ')).not.toContain('private-key');
    expect(log.mock.calls.flat().join(' ')).not.toContain('private-key');
  });
});
