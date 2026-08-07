'use strict';

/* global describe, it, expect */

const {
  normalizeTags,
  isClientExpired,
  shouldEnableOnExpireUpdate,
} = require('../lib/clientUtils');

describe('normalizeTags', () => {
  it('returns [] for undefined/null', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });

  it('trims, drops empties and dedupes', () => {
    expect(normalizeTags([' a ', 'b', 'a', '', '  '])).toEqual(['a', 'b']);
  });

  it('throws 400 for non-array input', () => {
    expect(() => normalizeTags('a')).toThrowError(expect.objectContaining({ statusCode: 400 }));
  });

  it('throws 400 for non-string items', () => {
    expect(() => normalizeTags([1])).toThrowError(expect.objectContaining({ statusCode: 400 }));
  });

  it('throws 400 for more than 10 tags', () => {
    const many = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(() => normalizeTags(many)).toThrowError(expect.objectContaining({ statusCode: 400 }));
  });

  it('throws 400 for a tag longer than 50 chars', () => {
    expect(() => normalizeTags(['x'.repeat(51)])).toThrowError(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('isClientExpired', () => {
  const now = new Date('2026-08-07T12:00:00Z');

  it('true when disabled and expiredAt in the past', () => {
    expect(isClientExpired({ enabled: false, expiredAt: '2026-08-01T00:00:00Z' }, now)).toBe(true);
  });

  it('false when enabled', () => {
    expect(isClientExpired({ enabled: true, expiredAt: '2026-08-01T00:00:00Z' }, now)).toBe(false);
  });

  it('false when expiredAt is null', () => {
    expect(isClientExpired({ enabled: false, expiredAt: null }, now)).toBe(false);
  });

  it('false when expiredAt in the future', () => {
    expect(isClientExpired({ enabled: false, expiredAt: '2026-09-01T00:00:00Z' }, now)).toBe(false);
  });
});

describe('shouldEnableOnExpireUpdate', () => {
  const now = new Date('2026-08-07T12:00:00Z');
  const expiredClient = { enabled: false, expiredAt: '2026-08-01T00:00:00Z' };

  it('true for expired client with future date', () => {
    expect(shouldEnableOnExpireUpdate(expiredClient, '2026-09-01T00:00:00Z', now)).toBe(true);
  });

  it('false when clearing the date', () => {
    expect(shouldEnableOnExpireUpdate(expiredClient, null, now)).toBe(false);
  });

  it('false for expired client with past date', () => {
    expect(shouldEnableOnExpireUpdate(expiredClient, '2026-08-02T00:00:00Z', now)).toBe(false);
  });

  it('false for manually disabled client without expiredAt', () => {
    expect(shouldEnableOnExpireUpdate({ enabled: false, expiredAt: null }, '2026-09-01T00:00:00Z', now)).toBe(false);
  });
});
