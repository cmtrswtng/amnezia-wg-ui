'use strict';

/* global describe, it, expect */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('path');

const AuditLog = require('../lib/AuditLog');

const makeLog = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-test-'));
  return { log: new AuditLog(path.join(dir, 'audit.jsonl')), dir };
};

describe('AuditLog', () => {
  it('writes and reads entries newest-first', async () => {
    const { log } = await makeLog();

    await log.log({
      actor: 'admin', action: 'client.create', clientId: 'a', clientName: 'first',
    });
    await log.log({
      actor: 'system', action: 'system.expired', clientId: 'b', clientName: 'second',
    });

    const entries = await log.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].action).toBe('system.expired');
    expect(entries[1].action).toBe('client.create');
    expect(entries[0].ts).toBeTruthy();
  });

  it('returns [] when the file does not exist', async () => {
    const { log } = await makeLog();
    expect(await log.getEntries()).toEqual([]);
  });

  it('skips malformed lines', async () => {
    const { log, dir } = await makeLog();
    await fs.writeFile(
      path.join(dir, 'audit.jsonl'),
      `${JSON.stringify({ ts: 'x', actor: 'admin', action: 'a' })}\nnot-json\n`,
      'utf8',
    );
    const entries = await log.getEntries();
    expect(entries).toHaveLength(1);
  });

  it('respects the limit', async () => {
    const { log } = await makeLog();
    for (let i = 0; i < 10; i++) {
      await log.log({ actor: 'admin', action: `a${i}` });
    }
    const entries = await log.getEntries({ limit: 3 });
    expect(entries).toHaveLength(3);
    expect(entries[0].action).toBe('a9');
  });

  it('rotates keeping the newest 5000 lines', async () => {
    const { log, dir } = await makeLog();
    const file = path.join(dir, 'audit.jsonl');
    const lines = [];
    for (let i = 0; i < 6001; i++) {
      lines.push(JSON.stringify({ ts: 'x', actor: 'admin', action: `a${i}` }));
    }
    await fs.writeFile(file, `${lines.join('\n')}\n`, 'utf8');

    await log.log({ actor: 'admin', action: 'trigger' });

    const content = await fs.readFile(file, 'utf8');
    const result = content.trim().split('\n');
    expect(result.length).toBe(5001);
    expect(JSON.parse(result[result.length - 1]).action).toBe('trigger');
    expect(JSON.parse(result[0]).action).not.toBe('a0');
  });

  it('never throws on write errors', async () => {
    const log = new AuditLog('/nonexistent-dir-deep/audit.jsonl');
    await expect(log.log({ actor: 'admin', action: 'x' })).resolves.toBeUndefined();
  });
});
