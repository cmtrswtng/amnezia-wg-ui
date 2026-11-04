'use strict';

const bcrypt = require('bcryptjs');

const { PASSWORD_HASH } = require('../config');

const requiresPassword = !!PASSWORD_HASH;
// Cookies are scoped by hostname/path, not by TCP port.
const sessionCookieName = (port) => `awg.sid.${port}`;

const unauthorized = (res, message) => {
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: message }));
};

/**
 * Checks if `password` matches the given bcrypt hash.
 *
 * @param {string} password String to test
 * @param {string} [hash] bcrypt hash, defaults to PASSWORD_HASH env
 * @returns {boolean} true if matching, otherwise false
 */
const isPasswordValid = (password, hash = PASSWORD_HASH) => {
  if (typeof password !== 'string') {
    return false;
  }
  if (hash) {
    return bcrypt.compareSync(password, hash);
  }

  return false;
};

/**
 * Auth middleware for all /api/* routes.
 * Accepts an authenticated session or the admin password
 * in the `Authorization` header.
 *
 * Future bot API: validate `Authorization: Bearer <API_TOKEN>` here,
 * so routes stay untouched.
 */
const apiAuthMiddleware = (req, res, next) => {
  if (!requiresPassword || !req.url.startsWith('/api/')) {
    return next();
  }

  if (req.session && req.session.authenticated) {
    return next();
  }

  if (req.headers['authorization']) {
    if (isPasswordValid(req.headers['authorization'])) {
      return next();
    }
    return unauthorized(res, 'Incorrect Password');
  }

  return unauthorized(res, 'Not Logged In');
};

module.exports = {
  requiresPassword,
  isPasswordValid,
  apiAuthMiddleware,
  sessionCookieName,
};
