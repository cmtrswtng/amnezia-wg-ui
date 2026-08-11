'use strict';

/* global describe, it, expect */

const {
  createAwg2Parameters,
  validateAwg2Parameters,
  migrateConfigToAwg2,
  renderAwg2InterfaceLines,
} = require('../lib/awgConfig');

const sequentialRandom = () => {
  const offsets = new Map();
  return (min, maxExclusive) => {
    const key = `${min}:${maxExclusive}`;
    const width = maxExclusive - min;
    const offset = offsets.get(key) ?? 0;
    const value = min + (offset % width);
    offsets.set(key, offset + 1);
    return value;
  };
};

const validServer = (overrides = {}) => ({
  jc: 4,
  jmin: 64,
  jmax: 512,
  s1: 15,
  s2: 16,
  s3: 17,
  s4: 8,
  h1: 101,
  h2: 102,
  h3: 103,
  h4: 104,
  i1: '',
  i2: '',
  i3: '',
  i4: '',
  i5: '',
  ...overrides,
});

describe('createAwg2Parameters', () => {
  it('creates deterministic values inside the cross-platform preset', () => {
    const result = createAwg2Parameters({ env: {}, randomInt: sequentialRandom() });

    expect(result).toMatchObject({
      jc: 4,
      jmin: 64,
      jmax: 512,
      s1: 15,
      s2: 16,
      s3: 17,
      s4: 8,
      i1: '',
      i2: '',
      i3: '',
      i4: '',
      i5: '',
    });
    expect(new Set([result.h1, result.h2, result.h3, result.h4]).size).toBe(4);
  });

  it('accepts explicit zero values instead of replacing them with defaults', () => {
    const result = createAwg2Parameters({
      env: {
        JC: '0',
        S3: '0',
        S4: '0',
        I1: '<b 0x0102>',
      },
      randomInt: sequentialRandom(),
    });

    expect(result.jc).toBe(0);
    expect(result.s3).toBe(0);
    expect(result.s4).toBe(0);
    expect(result.i1).toBe('<b 0x0102>');
  });

  it('rejects malformed numeric environment values', () => {
    expect(() => createAwg2Parameters({
      env: { JC: '4.5' },
      randomInt: sequentialRandom(),
    }))
      .toThrow('Invalid AWG 2 parameter JC: expected a base-10 integer');
  });

  it('accepts explicit headers and rejects duplicate explicit headers', () => {
    expect(createAwg2Parameters({
      env: {
        H1: '5',
        H2: '6',
        H3: '7',
        H4: '8',
      },
      randomInt: sequentialRandom(),
    })).toMatchObject({
      h1: 5,
      h2: 6,
      h3: 7,
      h4: 8,
    });
    expect(() => createAwg2Parameters({
      env: {
        H1: '5',
        H2: '5',
        H3: '7',
        H4: '8',
      },
      randomInt: sequentialRandom(),
    })).toThrow('Invalid AWG 2 parameter H2: header values must be unique');
  });

  it('fails if generated headers cannot be made unique', () => {
    const randomInt = () => 5;
    expect(() => createAwg2Parameters({
      env: {},
      randomInt,
    }))
      .toThrow('Cannot generate unique AWG 2 parameter H2');
  });
});

describe('validateAwg2Parameters', () => {
  it('accepts every cross-platform lower and upper boundary', () => {
    expect(validateAwg2Parameters(validServer({
      jc: 0,
      jmin: 0,
      jmax: 0,
      s1: 0,
      s2: 0,
      s3: 0,
      s4: 0,
      h1: 5,
      h2: 6,
      h3: 2_147_483_646,
      h4: 2_147_483_647,
    }))).toBeTruthy();
    expect(validateAwg2Parameters(validServer({
      jc: 128,
      jmin: 1279,
      jmax: 1279,
      s1: 64,
      s2: 64,
      s3: 64,
      s4: 32,
    }))).toBeTruthy();
  });

  it('rejects JMIN greater than JMAX and JMAX above the limit', () => {
    expect(() => validateAwg2Parameters(validServer({ jmin: 10, jmax: 9 })))
      .toThrow('Invalid AWG 2 parameters: JMIN must not exceed JMAX');
    expect(() => validateAwg2Parameters(validServer({ jmax: 1280 })))
      .toThrow('Invalid AWG 2 parameter JMAX: expected 0..1279');
  });

  it('rejects invalid values with the exact field name', () => {
    const cases = [
      ['jc', -1, 'JC'], ['jmin', 1280, 'JMIN'], ['s1', 65, 'S1'],
      ['s4', 33, 'S4'], ['h1', 4, 'H1'], ['h4', 2_147_483_648, 'H4'],
    ];
    cases.forEach(([field, value, name]) => {
      expect(() => validateAwg2Parameters(validServer({ [field]: value })))
        .toThrow(`Invalid AWG 2 parameter ${name}`);
    });
    expect(() => validateAwg2Parameters(validServer({ h2: 101 })))
      .toThrow('Invalid AWG 2 parameter H2: header values must be unique');
    expect(() => validateAwg2Parameters(validServer({ i1: 1 })))
      .toThrow('Invalid AWG 2 parameter I1: expected a string');
  });
});

describe('migrateConfigToAwg2', () => {
  const legacyConfig = {
    server: {
      privateKey: 'private-key',
      address: '10.0.0.1/24',
    },
    clients: {
      client1: {
        name: 'Alice',
        tags: ['tag'],
        expirationDate: '2026-12-01',
        quotaBytes: 100,
        oneTimeLink: 'secret',
      },
    },
  };

  it('immutably migrates legacy config while preserving server and clients', () => {
    const result = migrateConfigToAwg2(legacyConfig, {
      env: {},
      randomInt: sequentialRandom(),
    });

    expect(result.migrated).toBe(true);
    expect(result.config.protocolVersion).toBe(2);
    expect(result.config.server.privateKey).toBe(legacyConfig.server.privateKey);
    expect(result.config.clients).toEqual(legacyConfig.clients);
    expect(result.config.server.s3).toBeGreaterThan(0);
    expect(legacyConfig.protocolVersion).toBeUndefined();
    expect(legacyConfig.server.jc).toBeUndefined();
  });

  it('returns valid version-2 configs unchanged and is idempotent', () => {
    const config = { protocolVersion: 2, server: validServer(), clients: {} };
    const result = migrateConfigToAwg2(config);
    expect(result).toEqual({ config, migrated: false });
    expect(migrateConfigToAwg2(result.config)).toEqual({ config, migrated: false });
  });

  it('rejects unsupported protocol versions and invalid legacy configs', () => {
    expect(() => migrateConfigToAwg2({ protocolVersion: 3 }))
      .toThrow('Unsupported AmneziaWG protocol version: 3');
    expect(() => migrateConfigToAwg2({ clients: {} }))
      .toThrow('Invalid legacy WireGuard configuration: server and clients are required');
  });
});

describe('renderAwg2InterfaceLines', () => {
  it('renders fields in protocol order and omits empty signature packets', () => {
    expect(renderAwg2InterfaceLines(validServer())).toBe([
      'Jc = 4', 'Jmin = 64', 'Jmax = 512',
      'S1 = 15', 'S2 = 16', 'S3 = 17', 'S4 = 8',
      'H1 = 101', 'H2 = 102', 'H3 = 103', 'H4 = 104',
    ].join('\n'));
  });

  it('appends only non-empty signature packets', () => {
    expect(renderAwg2InterfaceLines(validServer({ i1: '<b 0x01>', i3: '<b 0x03>' })))
      .toContain('I1 = <b 0x01>\nI3 = <b 0x03>');
  });
});
