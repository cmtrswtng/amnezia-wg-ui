'use strict';

/* global describe, it, expect */

const {
  validateQuotaInput,
  transferDelta,
  isCycleDue,
  isQuotaExceeded,
  quotaCycleEndsAt,
} = require('../lib/quotaUtils');

describe('validateQuotaInput', () => {
  it('null-ish quotaBytes means unlimited', () => {
    expect(validateQuotaInput({ quotaBytes: null })).toEqual({ quotaBytes: null, quotaCycleDays: null });
    expect(validateQuotaInput({ quotaBytes: undefined })).toEqual({ quotaBytes: null, quotaCycleDays: null });
    expect(validateQuotaInput({ quotaBytes: '' })).toEqual({ quotaBytes: null, quotaCycleDays: null });
  });

  it('accepts positive integer bytes with default 30-day cycle', () => {
    expect(validateQuotaInput({ quotaBytes: 1024 })).toEqual({ quotaBytes: 1024, quotaCycleDays: 30 });
  });

  it('accepts explicit cycle days', () => {
    expect(validateQuotaInput({ quotaBytes: 1024, quotaCycleDays: 7 }))
      .toEqual({ quotaBytes: 1024, quotaCycleDays: 7 });
  });

  it('rejects non-positive or non-integer bytes with 400', () => {
    for (const bad of [0, -5, 1.5, 'abc', NaN]) {
      expect(() => validateQuotaInput({ quotaBytes: bad }))
        .toThrowError(expect.objectContaining({ statusCode: 400 }));
    }
  });

  it('rejects cycle days out of 1..365 or non-integer', () => {
    for (const bad of [0, 366, 2.5, 'x']) {
      expect(() => validateQuotaInput({ quotaBytes: 1024, quotaCycleDays: bad }))
        .toThrowError(expect.objectContaining({ statusCode: 400 }));
    }
  });
});

describe('transferDelta', () => {
  it('sums rx+tx deltas', () => {
    expect(transferDelta(100, 50, 160, 90)).toBe(100);
  });

  it('returns 0 on counter reset (negative delta)', () => {
    expect(transferDelta(1000, 1000, 5, 5)).toBe(0);
  });

  it('returns 0 when last counters are missing', () => {
    expect(transferDelta(undefined, null, 100, 100)).toBe(0);
  });
});

describe('isCycleDue', () => {
  const client = {
    quotaBytes: 1024,
    quotaCycleDays: 30,
    quotaCycleStartAt: '2026-08-01T00:00:00.000Z',
  };

  it('true when cycle elapsed', () => {
    expect(isCycleDue(client, new Date('2026-09-01T00:00:00.000Z'))).toBe(true);
  });

  it('false inside the cycle', () => {
    expect(isCycleDue(client, new Date('2026-08-15T00:00:00.000Z'))).toBe(false);
  });

  it('false without quota', () => {
    expect(isCycleDue({ quotaBytes: null }, new Date('2026-09-01T00:00:00.000Z'))).toBe(false);
  });
});

describe('isQuotaExceeded', () => {
  it('true when used >= limit', () => {
    expect(isQuotaExceeded({ quotaBytes: 100, quotaUsedBytes: 100 })).toBe(true);
  });

  it('false below limit / without limit / missing used', () => {
    expect(isQuotaExceeded({ quotaBytes: 100, quotaUsedBytes: 99 })).toBe(false);
    expect(isQuotaExceeded({ quotaBytes: null, quotaUsedBytes: 9999 })).toBe(false);
    expect(isQuotaExceeded({ quotaBytes: 100 })).toBe(false);
  });
});

describe('quotaCycleEndsAt', () => {
  it('start + cycleDays', () => {
    const ends = quotaCycleEndsAt({
      quotaBytes: 1,
      quotaCycleDays: 30,
      quotaCycleStartAt: '2026-08-01T00:00:00.000Z',
    });
    expect(ends.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('null without quota', () => {
    expect(quotaCycleEndsAt({ quotaBytes: null })).toBeNull();
  });
});
