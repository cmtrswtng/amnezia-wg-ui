'use strict';

/* global describe, it, expect */

const {
  createAwg31Parameters, validateAwg31Parameters, migrateConfigToAwg31,
  validatePersistedConfig, renderAwg31InterfaceLines,
} = require('../lib/awg31Config');
const { createAwg2Parameters } = require('../lib/awgConfig');

const options = { env: {}, randomInt: (min) => min, randomBytes: (size) => Buffer.alloc(size, 7) };
const legacy = () => ({
  server: { privateKey: 'server-private', publicKey: 'server-public', address: '10.8.0.1' },
  clients: {
    alice: {
      name: 'Alice',
      enabled: true,
      address: '10.8.0.2',
      publicKey: 'alice-public',
      privateKey: 'alice-private',
      preSharedKey: 'alice-psk',
      tags: ['team'],
      expiredAt: '2027-01-01',
      quotaBytes: 1024,
      quotaUsedBytes: 512,
      oneTimeLink: 'opaque',
    },
  },
  extra: { preserved: true },
});
const config31 = () => migrateConfigToAwg31(legacy(), options).config;

describe('AWG 3.1 parameters', () => {
  it('generates header protection, equal safe prefixes and bounded randomized timers', () => {
    const server = createAwg31Parameters(options);
    expect(server.headerProtectionKey).toBe(Buffer.alloc(32, 7).toString('base64'));
    expect(server.s1).toBeGreaterThanOrEqual(12);
    expect([server.s1, server.s2, server.s3, server.s4]).toEqual(Array(4).fill(server.s1));
    expect([server.h1, server.h2, server.h3, server.h4]).toEqual(['1', '2', '3', '4']);
    expect(server.randomTrailers).toBe(true);
    expect(server.disableCookies).toBe(false);
    expect(server.rekeyAfterTime).toBe('100-140');
    expect(server.rejectAfterTime).toBe('160-200');
    expect(server.i1).toBe('');
    expect(validateAwg31Parameters(server)).toBe(server);
  });

  it('accepts explicit ranges, booleans and CPS signatures without printing values', () => {
    const server = createAwg31Parameters({
      ...options,
      env: {
        H1: '100-200',
        H2: '300-400',
        H3: '500-600',
        H4: '700-800',
        RANDOM_TRAILERS: 'off',
        DISABLE_COOKIES: 'false',
        I1: '<b 0xaabb><r 20><t>',
      },
    });
    expect(server.h1).toBe('100-200');
    expect(server.randomTrailers).toBe(false);
    expect(renderAwg31InterfaceLines(server)).toContain('I1 = <b 0xaabb><r 20><t>');
  });

  it.each([
    ['HEADER_PROTECTION_KEY', 'secret-invalid', 'HeaderProtectionKey'],
    ['S4', '11', 'S4'], ['S1', '1.5', 'S1'], ['H1', '9-2', 'H1'],
    ['H4', '4294967296', 'H4'], ['H2', '1-2', 'overlap'],
    ['CONTENT_PADDING_ADDITION', '20-10', 'ContentPaddingAddition'],
    ['REKEY_AFTER_TIME', '190-210', 'RejectAfterTime'],
    ['RANDOM_TRAILERS', 'maybe', 'RandomTrailers'],
    ['I1', '<r 99999>', 'I1'], ['I1', '<b 0xabc>', 'I1'],
    ['I1', '<r 12>\n[Peer]', 'I1'], ['I1', 'nonsense', 'I1'],
  ])('rejects unsafe %s before rendering', (name, value, message) => {
    expect(() => createAwg31Parameters({ ...options, env: { [name]: value } })).toThrow(message);
  });

  it('rejects inconsistent prefix sizes when random trailers are enabled', () => {
    expect(() => createAwg31Parameters({ ...options, env: { S1: '20', S2: '24' } })).toThrow('RandomTrailers');
  });

  it('rejects all-zero header keys and never echoes an invalid secret', () => {
    for (const secret of [Buffer.alloc(32).toString('base64'), 'private-user-secret']) {
      try {
        createAwg31Parameters({ ...options, env: { HEADER_PROTECTION_KEY: secret } });
        throw new Error('expected rejection');
      } catch (err) {
        expect(err.message).toContain('HeaderProtectionKey');
        expect(err.message).not.toContain(secret);
      }
    }
  });
});

describe('AWG 3.1 migration', () => {
  it('migrates legacy data immutably, preserving every key and client field', () => {
    const source = legacy();
    const before = JSON.stringify(source);
    const result = migrateConfigToAwg31(source, options);
    expect(result).toMatchObject({ migrated: true, sourceVersion: 'awg1', config: { protocolVersion: '3.1' } });
    expect(result.config.clients).toEqual(source.clients);
    expect(result.config.extra).toEqual(source.extra);
    expect(result.config.server.privateKey).toBe(source.server.privateKey);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('validates and upgrades v2, with a distinct backup identity', () => {
    let n = 100;
    const source = { ...legacy(), protocolVersion: 2 };
    source.server = { ...source.server, ...createAwg2Parameters({ env: {}, randomInt: (min, max) => Math.max(min, Math.min(max - 1, n++)) }) };
    const result = migrateConfigToAwg31(source, options);
    expect(result.sourceVersion).toBe('awg2');
    expect(result.config.protocolVersion).toBe('3.1');
    expect(result.config.clients).toEqual(source.clients);
    source.server.s4 = 999;
    expect(() => migrateConfigToAwg31(source, options)).toThrow('S4');
  });

  it('never regenerates migrated parameters on repeated startup', () => {
    const config = config31();
    const result = migrateConfigToAwg31(config, {
      env: { S1: '999' },
      randomBytes: () => {
        throw new Error('must not generate');
      },
    });
    expect(result.config).toBe(config);
    expect(result.migrated).toBe(false);
    expect(validatePersistedConfig(config)).toBe(config);
  });

  it('rejects unknown versions and malformed clients without mutating input', () => {
    expect(() => migrateConfigToAwg31({ protocolVersion: 9 })).toThrow('Unsupported');
    expect(() => migrateConfigToAwg31({ server: legacy().server, clients: [] })).toThrow('clients');
    const source = legacy();
    source.clients.alice.enabled = 'yes';
    expect(() => migrateConfigToAwg31(source)).toThrow('enabled');
  });

  it('renders every supported field once, keeping shared header protection identical', () => {
    const { server } = config31();
    const lines = renderAwg31InterfaceLines(server);
    expect(lines).toContain(`HeaderProtectionKey = ${server.headerProtectionKey}`);
    expect(lines).toContain('RandomTrailers = on');
    expect(lines).toContain('DisableCookies = off');
    expect(lines).toContain('ContentPaddingAddition = 16-64');
    expect(lines).not.toContain('I1 =');
    expect(lines.match(/HeaderProtectionKey/g)).toHaveLength(1);
  });

  it('rejects string-typed persisted paddings before they can corrupt MTU arithmetic', () => {
    const config = config31();
    for (const field of ['s1', 's2', 's3', 's4']) config.server[field] = String(config.server[field]);
    expect(() => validatePersistedConfig(config)).toThrow('S1');
  });
});
