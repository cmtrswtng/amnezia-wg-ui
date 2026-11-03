'use strict';

const crypto = require('node:crypto');
const { validateCoreConfigShape, validatePersistedConfig: validateAwg2Config } = require('./awgConfig');

const PROTOCOL_VERSION = '3.1';
const fail = (name, reason) => {
  throw new Error(`Invalid AWG 3.1 parameter ${name}: ${reason}`);
};
const integer = (name, value, min, max) => {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) {
    return fail(name, 'expected a base-10 integer');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) return fail(name, `expected ${min}..${max}`);
  return number;
};

const range = (name, value, max = 65535) => {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+(?:-\d+)?$/.test(String(value))) {
    return fail(name, 'expected an integer or ordered range');
  }
  const parts = String(value).split('-');
  const low = integer(name, parts[0], 0, max);
  const high = integer(name, parts[1] ?? parts[0], 0, max);
  if (low > high) return fail(name, 'range minimum must not exceed maximum');
  return [low, high];
};

const boolean = (name, value) => {
  if ([true, 'true', 'on', '1'].includes(value)) return true;
  if ([false, 'false', 'off', '0'].includes(value)) return false;
  return fail(name, 'expected true/false or on/off');
};

const validateSignature = (name, value) => {
  if (typeof value !== 'string' || /[\r\n\0]/.test(value)) return fail(name, 'expected a single-line CPS string');
  if (value === '') return;
  const tags = value.match(/<(?:b 0x[\da-fA-F]+|r \d+|rc \d+|rd \d+|t)>/g);
  if (!tags || tags.join('') !== value) return fail(name, 'invalid CPS syntax');
  let size = 0;
  let timestamps = 0;
  for (const tag of tags) {
    if (tag === '<t>') {
      timestamps += 1;
      size += 4;
    } else if (tag.startsWith('<b ')) {
      const hex = tag.slice(5, -1);
      if (hex.length % 2 !== 0) return fail(name, 'hex bytes must have an even length');
      size += hex.length / 2;
    } else {
      size += integer(name, tag.match(/\d+/)[0], 1, 1000);
    }
  }
  if (timestamps > 1 || size > 1279) fail(name, 'CPS packet exceeds safe bounds');
};

const RANGE_FIELDS = [
  ['contentPaddingAddition', 'ContentPaddingAddition', 'CONTENT_PADDING_ADDITION', '16-64'],
  ['rekeyAfterTime', 'RekeyAfterTime', 'REKEY_AFTER_TIME', '100-140'],
  ['rekeyTimeout', 'RekeyTimeout', 'REKEY_TIMEOUT', '4-6'],
  ['rejectAfterTime', 'RejectAfterTime', 'REJECT_AFTER_TIME', '160-200'],
  ['keepaliveTimeout', 'KeepaliveTimeout', 'KEEPALIVE_TIMEOUT', '9-14'],
  ['maxHandshakeAttempts', 'MaxHandshakeAttempts', 'MAX_HANDSHAKE_ATTEMPTS', '18-24'],
];

const validateAwg31Parameters = (server) => {
  if (!server || typeof server !== 'object' || Array.isArray(server)) return fail('server', 'expected an object');
  ['jc', 'jmin', 'jmax', 's1', 's2', 's3', 's4'].forEach((field) => {
    if (typeof server[field] !== 'number') fail(field.toUpperCase(), 'persisted value must be a number');
  });
  integer('JC', server.jc, 0, 128);
  integer('JMIN', server.jmin, 0, 1279);
  integer('JMAX', server.jmax, 0, 1279);
  if (server.jmin > server.jmax) fail('JMIN', 'must not exceed JMAX');
  const key = server.headerProtectionKey;
  if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key)
    || Buffer.from(key, 'base64').length !== 32 || Buffer.from(key, 'base64').toString('base64') !== key
    || Buffer.from(key, 'base64').every((byte) => byte === 0)) {
    fail('HeaderProtectionKey', 'expected a nonzero 32-byte base64 key');
  }
  ['s1', 's2', 's3', 's4'].forEach((field) => integer(field.toUpperCase(), server[field], 12, field === 's4' ? 128 : 1024));
  const headers = ['h1', 'h2', 'h3', 'h4'].map((field) => range(field.toUpperCase(), server[field], 4294967295));
  headers.forEach(([low, high], index) => {
    if (headers.slice(0, index).some(([otherLow, otherHigh]) => low <= otherHigh && high >= otherLow)) {
      fail(`H${index + 1}`, 'header ranges must not overlap');
    }
  });
  RANGE_FIELDS.forEach(([field, name]) => range(name, server[field]));
  const rekey = range('RekeyAfterTime', server.rekeyAfterTime);
  const reject = range('RejectAfterTime', server.rejectAfterTime);
  if (reject[0] !== 0 && reject[0] <= (rekey[1] || 120)) fail('RejectAfterTime', 'minimum must exceed RekeyAfterTime maximum');
  ['randomTrailers', 'disableCookies'].forEach((field) => {
    if (typeof server[field] !== 'boolean') fail(field, 'expected a boolean');
  });
  if (server.randomTrailers && new Set([server.s1, server.s2, server.s3, server.s4]).size !== 1) {
    fail('RandomTrailers', 'S1-S4 must be equal for reliable packet detection');
  }
  ['i1', 'i2', 'i3', 'i4', 'i5'].forEach((field) => validateSignature(field.toUpperCase(), server[field]));
  return server;
};

const createAwg31Parameters = ({ env = process.env, randomInt = crypto.randomInt, randomBytes = crypto.randomBytes } = {}) => {
  const padding = randomInt(16, 33);
  const server = {
    jc: integer('JC', env.JC ?? randomInt(4, 9), 0, 128),
    jmin: integer('JMIN', env.JMIN ?? 64, 0, 1279),
    jmax: integer('JMAX', env.JMAX ?? 512, 0, 1279),
    headerProtectionKey: env.HEADER_PROTECTION_KEY ?? randomBytes(32).toString('base64'),
    randomTrailers: boolean('RandomTrailers', env.RANDOM_TRAILERS ?? true),
    disableCookies: boolean('DisableCookies', env.DISABLE_COOKIES ?? false),
  };
  ['s1', 's2', 's3', 's4'].forEach((field) => {
    server[field] = integer(field.toUpperCase(), env[field.toUpperCase()] ?? padding, 12, field === 's4' ? 128 : 1024);
  });
  ['h1', 'h2', 'h3', 'h4'].forEach((field, index) => {
    server[field] = String(env[field.toUpperCase()] ?? index + 1);
  });
  RANGE_FIELDS.forEach(([field, name, envName, fallback]) => {
    server[field] = String(env[envName] ?? fallback);
  });
  ['i1', 'i2', 'i3', 'i4', 'i5'].forEach((field) => {
    server[field] = env[field.toUpperCase()] ?? '';
  });
  return validateAwg31Parameters(server);
};

const validatePersistedConfig = (config) => {
  validateCoreConfigShape(config, 'Invalid AWG 3.1 WireGuard configuration');
  if (config.protocolVersion !== PROTOCOL_VERSION) fail('protocolVersion', `expected ${PROTOCOL_VERSION}`);
  validateAwg31Parameters(config.server);
  return config;
};

const migrateConfigToAwg31 = (config, options = {}) => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Invalid legacy WireGuard configuration: expected an object');
  }
  if (config.protocolVersion === PROTOCOL_VERSION) {
    validatePersistedConfig(config);
    return { config, migrated: false, sourceVersion: null };
  }
  if (config.protocolVersion !== undefined && config.protocolVersion !== 2) {
    throw new Error(`Unsupported AmneziaWG protocol version: ${config.protocolVersion}`);
  }
  const sourceVersion = config.protocolVersion === 2 ? 'awg2' : 'awg1';
  if (sourceVersion === 'awg2') validateAwg2Config(config);
  else validateCoreConfigShape(config, 'Invalid legacy WireGuard configuration');
  const migrated = {
    ...config,
    protocolVersion: PROTOCOL_VERSION,
    server: { ...config.server, ...createAwg31Parameters(options) },
    clients: config.clients,
  };
  validatePersistedConfig(migrated);
  return { config: migrated, migrated: true, sourceVersion };
};

const renderAwg31InterfaceLines = (server) => {
  validateAwg31Parameters(server);
  const fields = [
    ['jc', 'Jc'], ['jmin', 'Jmin'], ['jmax', 'Jmax'],
    ['s1', 'S1'], ['s2', 'S2'], ['s3', 'S3'], ['s4', 'S4'],
    ['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4'],
    ['headerProtectionKey', 'HeaderProtectionKey'],
    ...RANGE_FIELDS.map(([field, name]) => [field, name]),
    ['randomTrailers', 'RandomTrailers'], ['disableCookies', 'DisableCookies'],
  ];
  const lines = fields.map(([field, name]) => {
    let value = server[field];
    if (typeof value === 'boolean') value = value ? 'on' : 'off';
    return `${name} = ${value}`;
  });
  ['i1', 'i2', 'i3', 'i4', 'i5'].forEach((field) => {
    if (server[field]) lines.push(`${field.toUpperCase()} = ${server[field]}`);
  });
  return lines.join('\n');
};

module.exports = {
  PROTOCOL_VERSION,
  createAwg31Parameters,
  validateAwg31Parameters,
  validatePersistedConfig,
  migrateConfigToAwg31,
  renderAwg31InterfaceLines,
};
