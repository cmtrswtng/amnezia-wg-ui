'use strict';

/* global describe, it, expect, vi */

const WireGuard = require('../lib/WireGuard');
const Util = require('../lib/Util');

const makeWireGuard = (clients, dump = '') => {
  const wg = new WireGuard();
  const config = { server: {}, clients };
  wg.getConfig = async () => config;
  wg.saveConfig = vi.fn(async () => {});
  Util.exec = vi.fn(async () => dump);
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

const dumpLine = (publicKey, rx, tx) => `pub\tpsk\tendpoint\tallowed\t0\t0\t0\t0\n${publicKey}\tpsk\t(none)\t10.8.0.2/32\t0\t${rx}\t${tx}\t0`;

describe('setClientQuota', () => {
  it('sets a fresh quota: cycle starts now, used = 0', async () => {
    const { wg, config } = makeWireGuard({ 'id-1': makeClient() });

    await wg.setClientQuota({ clientId: 'id-1', quotaBytes: 1024, quotaCycleDays: 7 });

    const client = config.clients['id-1'];
    expect(client.quotaBytes).toBe(1024);
    expect(client.quotaCycleDays).toBe(7);
    expect(client.quotaUsedBytes).toBe(0);
    expect(client.quotaCycleStartAt).toBeInstanceOf(Date);
    expect(wg.saveConfig).toHaveBeenCalledOnce();
  });

  it('keeps current usage when only the limit changes', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({
        quotaBytes: 1024,
        quotaCycleDays: 30,
        quotaCycleStartAt: new Date('2026-08-01T00:00:00Z'),
        quotaUsedBytes: 500,
      }),
    });

    await wg.setClientQuota({ clientId: 'id-1', quotaBytes: 2048, quotaCycleDays: 30 });

    expect(config.clients['id-1'].quotaUsedBytes).toBe(500);
    expect(new Date(config.clients['id-1'].quotaCycleStartAt).toISOString())
      .toBe('2026-08-01T00:00:00.000Z');
  });

  it('clears quota fields on null', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({
        quotaBytes: 1024, quotaCycleDays: 30, quotaUsedBytes: 500, quotaExceeded: true,
      }),
    });

    await wg.setClientQuota({ clientId: 'id-1', quotaBytes: null });

    const client = config.clients['id-1'];
    expect(client.quotaBytes).toBeNull();
    expect(client.quotaExceeded).toBe(false);
  });

  it('rejects invalid input with 400', async () => {
    const { wg } = makeWireGuard({ 'id-1': makeClient() });
    await expect(wg.setClientQuota({ clientId: 'id-1', quotaBytes: -1 }))
      .rejects.toThrowError(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('cron quota accounting', () => {
  it('accrues transfer deltas from wg dump', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({
        quotaBytes: 10_000,
        quotaCycleDays: 30,
        quotaCycleStartAt: new Date(),
        quotaUsedBytes: 0,
        quotaLastRx: 100,
        quotaLastTx: 100,
      }),
    }, dumpLine('pk1', 400, 300));

    await wg.cronJobEveryMinute();

    expect(config.clients['id-1'].quotaUsedBytes).toBe(500);
    expect(config.clients['id-1'].quotaLastRx).toBe(400);
    expect(config.clients['id-1'].quotaLastTx).toBe(300);
  });

  it('disables and flags the client when quota is exceeded', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({
        quotaBytes: 100,
        quotaCycleDays: 30,
        quotaCycleStartAt: new Date(),
        quotaUsedBytes: 90,
        quotaLastRx: 0,
        quotaLastTx: 0,
      }),
    }, dumpLine('pk1', 30, 30));

    await wg.cronJobEveryMinute();

    expect(config.clients['id-1'].enabled).toBe(false);
    expect(config.clients['id-1'].quotaExceeded).toBe(true);
  });

  it('rolls the cycle over and re-enables a quota-exceeded client', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({
        enabled: false,
        quotaBytes: 100,
        quotaCycleDays: 1,
        quotaCycleStartAt: new Date(Date.now() - 2 * 86400000),
        quotaUsedBytes: 100,
        quotaExceeded: true,
      }),
    });

    await wg.cronJobEveryMinute();

    const client = config.clients['id-1'];
    expect(client.quotaUsedBytes).toBe(0);
    expect(client.quotaExceeded).toBe(false);
    expect(client.enabled).toBe(true);
  });

  it('rollover does not enable an expired client', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({
        enabled: false,
        expiredAt: new Date(Date.now() - 60_000),
        quotaBytes: 100,
        quotaCycleDays: 1,
        quotaCycleStartAt: new Date(Date.now() - 2 * 86400000),
        quotaUsedBytes: 100,
        quotaExceeded: true,
      }),
    });

    await wg.cronJobEveryMinute();

    expect(config.clients['id-1'].quotaUsedBytes).toBe(0);
    expect(config.clients['id-1'].enabled).toBe(false);
  });
});

describe('quota resets on renewal paths', () => {
  it('updateClientExpireDate with a future date resets the cycle', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({
        enabled: false,
        quotaBytes: 100,
        quotaCycleDays: 30,
        quotaCycleStartAt: new Date('2026-07-01T00:00:00Z'),
        quotaUsedBytes: 100,
        quotaExceeded: true,
      }),
    });

    await wg.updateClientExpireDate({
      clientId: 'id-1',
      expireDate: new Date(Date.now() + 86400000).toISOString(),
    });

    const client = config.clients['id-1'];
    expect(client.quotaUsedBytes).toBe(0);
    expect(client.quotaExceeded).toBe(false);
    expect(new Date(client.quotaCycleStartAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('enableClient resets the cycle for a quota-exceeded client', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({
        enabled: false,
        quotaBytes: 100,
        quotaCycleDays: 30,
        quotaCycleStartAt: new Date('2026-07-01T00:00:00Z'),
        quotaUsedBytes: 100,
        quotaExceeded: true,
      }),
    });

    await wg.enableClient({ clientId: 'id-1' });

    const client = config.clients['id-1'];
    expect(client.enabled).toBe(true);
    expect(client.quotaUsedBytes).toBe(0);
    expect(client.quotaExceeded).toBe(false);
  });

  it('resetClientQuota starts a new cycle and re-enables', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({
        enabled: false,
        quotaBytes: 100,
        quotaCycleDays: 30,
        quotaCycleStartAt: new Date('2026-07-01T00:00:00Z'),
        quotaUsedBytes: 100,
        quotaExceeded: true,
      }),
    });

    await wg.resetClientQuota({ clientId: 'id-1' });

    const client = config.clients['id-1'];
    expect(client.enabled).toBe(true);
    expect(client.quotaUsedBytes).toBe(0);
    expect(client.quotaExceeded).toBe(false);
  });
});
