'use strict';

/* global describe, it, expect, vi, beforeEach */

const AuditLog = require('../services/AuditLog');
const Util = require('../lib/Util');
const WireGuard = require('../lib/WireGuard');

const makeWireGuard = (clients) => {
  const wg = new WireGuard();
  const config = { server: {}, clients };
  wg.getConfig = async () => config;
  wg.saveConfig = vi.fn(async () => {});
  return { wg, config };
};

const makeClient = (overrides = {}) => ({
  id: 'id-1',
  name: 'test',
  address: '10.8.0.2',
  publicKey: 'pk1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  expiredAt: null,
  enabled: true,
  ...overrides,
});

beforeEach(() => {
  AuditLog.log = vi.fn(async () => {});
  Util.exec = vi.fn(async () => '');
});

describe('audit instrumentation', () => {
  it('logs admin actions with client context', async () => {
    const { wg } = makeWireGuard({ 'id-1': makeClient() });

    await wg.setClientTags({ clientId: 'id-1', tags: ['a'] });

    expect(AuditLog.log).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'admin',
      action: 'client.tags',
      clientId: 'id-1',
      clientName: 'test',
    }));
  });

  it('logs system events from cron (expiry)', async () => {
    const { wg } = makeWireGuard({
      'id-1': makeClient({ expiredAt: new Date(Date.now() - 60_000) }),
    });

    await wg.cronJobEveryMinute();

    expect(AuditLog.log).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'system',
      action: 'system.expired',
      clientId: 'id-1',
    }));
  });

  it('logs system events from cron (quota exceeded)', async () => {
    const { wg } = makeWireGuard({
      'id-1': makeClient({
        quotaBytes: 100,
        quotaCycleDays: 30,
        quotaCycleStartAt: new Date(),
        quotaUsedBytes: 150,
      }),
    });

    await wg.cronJobEveryMinute();

    expect(AuditLog.log).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'system',
      action: 'system.quotaExceeded',
    }));
  });
});
