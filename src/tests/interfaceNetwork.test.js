'use strict';

/* global describe, it, expect */
const { addressTemplate, interfaceHooks } = require('../lib/interfaceNetwork');

describe('persisted interface network', () => {
  it('uses the restored subnet while retaining the deployment port and egress device', () => {
    const hooks = interfaceHooks({ address: '10.8.0.1' }, { WG_DEFAULT_ADDRESS: '10.9.0.x', WG_PORT: '51822', WG_DEVICE: 'eth1' });
    expect(hooks.postUp).toContain('-s 10.8.0.0/24 -o eth1');
    expect(hooks.postUp).toContain('--dport 51822');
    expect(hooks.postDown).toContain('-D POSTROUTING -s 10.8.0.0/24');
    expect(hooks.postUp).not.toContain('10.9.0');
    expect(addressTemplate({ address: '10.8.0.1' })).toBe('10.8.0.x');
  });
  it('preserves explicit custom lifecycle hooks', () => {
    expect(interfaceHooks({ address: '10.8.0.1' }, {
      WG_PRE_UP: 'before-up', WG_POST_UP: 'after-up', WG_PRE_DOWN: 'before-down', WG_POST_DOWN: 'after-down',
    })).toEqual({
      preUp: 'before-up', postUp: 'after-up', preDown: 'before-down', postDown: 'after-down',
    });
  });
  it('rejects an unsupported subnet before network commands run', () => {
    expect(() => interfaceHooks({ address: '::1' }, {})).toThrow('IPv4');
  });
});
