'use strict';

const crypto = require('node:crypto');

const PROTOCOL_VERSION = 2;

const parseInteger = (name, value) => {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid AWG 2 parameter ${name}: expected a base-10 integer`);
  }
  return Number(value);
};

const envInteger = (env, name, fallback) => (
  env[name] === undefined ? fallback() : parseInteger(name, env[name])
);

const assertRange = (name, value, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid AWG 2 parameter ${name}: expected ${min}..${max}`);
  }
};

const validateAwg2Parameters = (server) => {
  assertRange('JC', server.jc, 0, 128);
  assertRange('JMIN', server.jmin, 0, 1279);
  assertRange('JMAX', server.jmax, 0, 1279);
  if (server.jmin > server.jmax) {
    throw new Error('Invalid AWG 2 parameters: JMIN must not exceed JMAX');
  }
  ['s1', 's2', 's3'].forEach((field) => assertRange(field.toUpperCase(), server[field], 0, 64));
  assertRange('S4', server.s4, 0, 32);
  ['h1', 'h2', 'h3', 'h4'].forEach((field) => assertRange(field.toUpperCase(), server[field], 5, 2_147_483_647));
  const headers = [server.h1, server.h2, server.h3, server.h4];
  const duplicateIndex = headers.findIndex((value, index) => headers.indexOf(value) !== index);
  if (duplicateIndex !== -1) {
    throw new Error(`Invalid AWG 2 parameter H${duplicateIndex + 1}: header values must be unique`);
  }
  ['i1', 'i2', 'i3', 'i4', 'i5'].forEach((field) => {
    if (typeof server[field] !== 'string') {
      throw new Error(`Invalid AWG 2 parameter ${field.toUpperCase()}: expected a string`);
    }
  });
  return server;
};

const createAwg2Parameters = ({
  env = process.env,
  randomInt = crypto.randomInt,
} = {}) => {
  const random = (min, max) => randomInt(min, max + 1);
  const result = {
    jc: envInteger(env, 'JC', () => random(4, 8)),
    jmin: envInteger(env, 'JMIN', () => 64),
    jmax: envInteger(env, 'JMAX', () => 512),
    s1: envInteger(env, 'S1', () => random(15, 64)),
    s2: envInteger(env, 'S2', () => random(15, 64)),
    s3: envInteger(env, 'S3', () => random(15, 64)),
    s4: envInteger(env, 'S4', () => random(8, 32)),
    i1: env.I1 ?? '',
    i2: env.I2 ?? '',
    i3: env.I3 ?? '',
    i4: env.I4 ?? '',
    i5: env.I5 ?? '',
  };

  const headerNames = ['H1', 'H2', 'H3', 'H4'];
  const explicitHeaders = headerNames
    .filter((name) => env[name] !== undefined)
    .map((name) => parseInteger(name, env[name]));
  const usedHeaders = new Set(explicitHeaders);
  headerNames.forEach((name) => {
    const field = name.toLowerCase();
    if (env[name] !== undefined) {
      result[field] = parseInteger(name, env[name]);
      return;
    }
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = random(5, 2_147_483_647);
      if (!usedHeaders.has(candidate)) {
        result[field] = candidate;
        usedHeaders.add(candidate);
        return;
      }
    }
    throw new Error(`Cannot generate unique AWG 2 parameter ${name}`);
  });

  return validateAwg2Parameters(result);
};

const migrateConfigToAwg2 = (config, options = {}) => {
  if (config.protocolVersion === PROTOCOL_VERSION) {
    validateAwg2Parameters(config.server);
    return { config, migrated: false };
  }
  if (config.protocolVersion !== undefined) {
    throw new Error(`Unsupported AmneziaWG protocol version: ${config.protocolVersion}`);
  }
  if (!config.server || !config.clients || typeof config.clients !== 'object') {
    throw new Error('Invalid legacy WireGuard configuration: server and clients are required');
  }
  const parameters = createAwg2Parameters(options);
  return {
    migrated: true,
    config: {
      ...config,
      protocolVersion: PROTOCOL_VERSION,
      server: { ...config.server, ...parameters },
      clients: config.clients,
    },
  };
};

const FIELD_NAMES = [
  ['jc', 'Jc'], ['jmin', 'Jmin'], ['jmax', 'Jmax'],
  ['s1', 'S1'], ['s2', 'S2'], ['s3', 'S3'], ['s4', 'S4'],
  ['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4'],
];

const renderAwg2InterfaceLines = (server) => {
  validateAwg2Parameters(server);
  const lines = FIELD_NAMES.map(([field, output]) => `${output} = ${server[field]}`);
  ['i1', 'i2', 'i3', 'i4', 'i5'].forEach((field, index) => {
    if (server[field] !== '') lines.push(`I${index + 1} = ${server[field]}`);
  });
  return lines.join('\n');
};

module.exports = {
  PROTOCOL_VERSION,
  createAwg2Parameters,
  validateAwg2Parameters,
  migrateConfigToAwg2,
  renderAwg2InterfaceLines,
};
