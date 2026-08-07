'use strict';

const ServerError = require('./ServerError');

const MS_PER_DAY = 86400000;
const DEFAULT_CYCLE_DAYS = 30;
const MAX_CYCLE_DAYS = 365;

/**
 * Validates quota input from API requests.
 *
 * @param {object} input { quotaBytes, quotaCycleDays }
 * @returns {{ quotaBytes: number|null, quotaCycleDays: number|null }}
 */
const validateQuotaInput = ({ quotaBytes, quotaCycleDays } = {}) => {
  if (quotaBytes === null || quotaBytes === undefined || quotaBytes === '') {
    return { quotaBytes: null, quotaCycleDays: null };
  }

  if (typeof quotaBytes !== 'number' || !Number.isInteger(quotaBytes) || quotaBytes <= 0) {
    throw new ServerError('Invalid quotaBytes: expected a positive integer', 400);
  }

  let days = quotaCycleDays;
  if (days === undefined || days === null || days === '') {
    days = DEFAULT_CYCLE_DAYS;
  }
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_CYCLE_DAYS) {
    throw new ServerError(`Invalid quotaCycleDays: expected an integer between 1 and ${MAX_CYCLE_DAYS}`, 400);
  }

  return { quotaBytes, quotaCycleDays: days };
};

/**
 * Bytes to accrue from cumulative wg counters. Counter resets
 * (interface restart) yield 0 — never a negative accrual.
 *
 * @returns {number} bytes used since the last measurement
 */
const transferDelta = (lastRx, lastTx, rx, tx) => {
  if (typeof lastRx !== 'number' || typeof lastTx !== 'number') return 0;
  const delta = (rx - lastRx) + (tx - lastTx);
  return delta > 0 ? delta : 0;
};

/**
 * Whether the client's quota cycle has elapsed.
 */
const isCycleDue = (client, now = new Date()) => {
  if (!client.quotaBytes || !client.quotaCycleStartAt || !client.quotaCycleDays) return false;
  return now >= new Date(new Date(client.quotaCycleStartAt).getTime() + client.quotaCycleDays * MS_PER_DAY);
};

/**
 * Whether the client has used up the quota.
 */
const isQuotaExceeded = (client) => {
  return typeof client.quotaBytes === 'number'
    && client.quotaBytes > 0
    && (client.quotaUsedBytes ?? 0) >= client.quotaBytes;
};

/**
 * End of the current quota cycle, or null for unlimited clients.
 *
 * @returns {Date|null}
 */
const quotaCycleEndsAt = (client) => {
  if (!client.quotaBytes || !client.quotaCycleStartAt || !client.quotaCycleDays) return null;
  return new Date(new Date(client.quotaCycleStartAt).getTime() + client.quotaCycleDays * MS_PER_DAY);
};

module.exports = {
  MS_PER_DAY,
  DEFAULT_CYCLE_DAYS,
  MAX_CYCLE_DAYS,
  validateQuotaInput,
  transferDelta,
  isCycleDue,
  isQuotaExceeded,
  quotaCycleEndsAt,
};
