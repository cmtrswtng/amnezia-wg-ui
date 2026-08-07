'use strict';

const ServerError = require('./ServerError');

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 50;

/**
 * Normalizes and validates a list of client tags.
 * Returns a clean array or throws ServerError(400).
 *
 * @param {*} input raw tags value from a request
 * @returns {string[]} normalized tags
 */
const normalizeTags = (input) => {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    throw new ServerError('Invalid tags: expected an array of strings', 400);
  }

  const tags = [];
  for (const raw of input) {
    if (typeof raw !== 'string') {
      throw new ServerError('Invalid tags: every tag must be a string', 400);
    }
    const tag = raw.trim();
    if (tag === '') continue;
    if (tag.length > MAX_TAG_LENGTH) {
      throw new ServerError(`Invalid tag: longer than ${MAX_TAG_LENGTH} characters`, 400);
    }
    if (!tags.includes(tag)) tags.push(tag);
  }

  if (tags.length > MAX_TAGS) {
    throw new ServerError(`Too many tags: maximum is ${MAX_TAGS}`, 400);
  }

  return tags;
};

/**
 * A client is "expired" when it is disabled and its expiry date has passed.
 *
 * @param {object} client client record from wg0.json
 * @param {Date} [now] current time (injectable for tests)
 * @returns {boolean}
 */
const isClientExpired = (client, now = new Date()) => {
  return client.enabled === false
    && client.expiredAt !== null
    && client.expiredAt !== undefined
    && now > new Date(client.expiredAt);
};

/**
 * Whether updating expireDate should automatically re-enable the client:
 * the new date is set, lies in the future, and the client is currently expired.
 *
 * @param {object} client client record from wg0.json
 * @param {string|null} expireDate new expiry date (ISO) or null
 * @param {Date} [now] current time (injectable for tests)
 * @returns {boolean}
 */
const shouldEnableOnExpireUpdate = (client, expireDate, now = new Date()) => {
  if (!expireDate) return false;
  return isClientExpired(client, now) && new Date(expireDate) > now;
};

module.exports = {
  MAX_TAGS,
  MAX_TAG_LENGTH,
  normalizeTags,
  isClientExpired,
  shouldEnableOnExpireUpdate,
};
