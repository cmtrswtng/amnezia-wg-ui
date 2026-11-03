'use strict';

/* global describe, it, expect, vi, afterEach */
const fs = require('node:fs/promises');
const { interfaceEpoch } = require('../lib/traffic');

describe('traffic interface identity', () => {
  afterEach(() => vi.restoreAllMocks());
  it('distinguishes recreated containers even when their interface index is reused', async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (file) => (file.includes('boot_id') ? 'boot-id\n' : '3\n'));
    const namespace = vi.spyOn(fs, 'readlink').mockResolvedValue('net:[100]');
    const first = await interfaceEpoch();
    namespace.mockResolvedValue('net:[200]');
    expect(await interfaceEpoch()).not.toBe(first);
  });
  it('fails instead of guessing an identity when the interface cannot be read', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('interface absent'));
    vi.spyOn(fs, 'readlink').mockResolvedValue('net:[100]');
    await expect(interfaceEpoch()).rejects.toThrow('interface absent');
  });
});
