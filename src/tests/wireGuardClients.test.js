'use strict';

/* global describe, it, expect, vi */

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
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  expiredAt: null,
  enabled: true,
  ...overrides,
});

describe('setClientTags', () => {
  it('normalizes and stores tags, then saves', async () => {
    const { wg, config } = makeWireGuard({ 'id-1': makeClient() });

    await wg.setClientTags({ clientId: 'id-1', tags: [' sales ', 'sales', 'vip'] });

    expect(config.clients['id-1'].tags).toEqual(['sales', 'vip']);
    expect(wg.saveConfig).toHaveBeenCalledOnce();
  });

  it('throws 404 for unknown client', async () => {
    const { wg } = makeWireGuard({});
    await expect(wg.setClientTags({ clientId: 'nope', tags: [] }))
      .rejects.toThrowError(expect.objectContaining({ statusCode: 404 }));
  });
});

describe('updateClientExpireDate', () => {
  it('stores the date with minute precision (no end-of-day forcing)', async () => {
    const { wg, config } = makeWireGuard({ 'id-1': makeClient() });

    await wg.updateClientExpireDate({ clientId: 'id-1', expireDate: '2026-09-01T14:30:00Z' });

    expect(new Date(config.clients['id-1'].expiredAt).toISOString()).toBe('2026-09-01T14:30:00.000Z');
  });

  it('clears the date on null', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({ expiredAt: new Date('2026-09-01T00:00:00Z') }),
    });

    await wg.updateClientExpireDate({ clientId: 'id-1', expireDate: null });

    expect(config.clients['id-1'].expiredAt).toBeNull();
  });

  it('re-enables an expired client when the new date is in the future', async () => {
    const { wg, config } = makeWireGuard({
      'id-1': makeClient({ enabled: false, expiredAt: new Date(Date.now() - 60_000) }),
    });

    await wg.updateClientExpireDate({
      clientId: 'id-1',
      expireDate: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(config.clients['id-1'].enabled).toBe(true);
  });

  it('does not enable a manually disabled client without expiredAt', async () => {
    const { wg, config } = makeWireGuard({ 'id-1': makeClient({ enabled: false }) });

    await wg.updateClientExpireDate({
      clientId: 'id-1',
      expireDate: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(config.clients['id-1'].enabled).toBe(false);
  });
});

describe('cronJobEveryMinute', () => {
  it('disables expired clients without any feature flag', async () => {
    const { wg, config } = makeWireGuard({
      expired: makeClient({ id: 'expired', expiredAt: new Date(Date.now() - 60_000) }),
      fresh: makeClient({ id: 'fresh', expiredAt: new Date(Date.now() + 86_400_000) }),
      permanent: makeClient({ id: 'permanent' }),
    });

    await wg.cronJobEveryMinute();

    expect(config.clients.expired.enabled).toBe(false);
    expect(config.clients.fresh.enabled).toBe(true);
    expect(config.clients.permanent.enabled).toBe(true);
    expect(wg.saveConfig).toHaveBeenCalledOnce();
  });

  it('does not save when nothing changed', async () => {
    const { wg } = makeWireGuard({ permanent: makeClient({ id: 'permanent' }) });

    await wg.cronJobEveryMinute();

    expect(wg.saveConfig).not.toHaveBeenCalled();
  });
});
