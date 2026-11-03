'use strict';

/* global describe, it, expect, vi */

const QRCode = require('qrcode');
const { getClientNetworkSettings, renderClientProfile } = require('../lib/clientProfile');
const { createAwg31Parameters, renderAwg31InterfaceLines } = require('../lib/awg31Config');
const WireGuard = require('../lib/WireGuard');

const fixture = () => ({
  protocolVersion: '3.1',
  server: { ...createAwg31Parameters({ env: {}, randomInt: (min) => min }), publicKey: 'server-public' },
  clients: {
    alice: {
      privateKey: 'client-private', publicKey: 'client-public', address: '10.8.0.2', preSharedKey: 'psk',
    },
  },
});

describe('shared client network settings', () => {
  it('defaults to IPv4, Yandex DNS, explicit MTU and mobile NAT keepalive', () => {
    expect(getClientNetworkSettings({})).toEqual({
      allowedIPs: '0.0.0.0/0', dns: '77.88.8.8, 77.88.8.1', mtu: 1280, keepalive: '20-25',
    });
  });

  it('preserves intentional overrides and an explicitly empty DNS', () => {
    expect(getClientNetworkSettings({
      WG_ALLOWED_IPS: '10.0.0.0/8, 192.168.1.0/24',
      WG_DEFAULT_DNS: '',
      WG_MTU: '1300',
      WG_PERSISTENT_KEEPALIVE: '0',
    })).toEqual({
      allowedIPs: '10.0.0.0/8, 192.168.1.0/24', dns: '', mtu: 1300, keepalive: '0',
    });
  });

  it.each([
    ['WG_ALLOWED_IPS', '0.0.0.0/33'], ['WG_ALLOWED_IPS', '999.1.1.1/24'],
    ['WG_DEFAULT_DNS', '8.8.8.8\n[Peer]'], ['WG_DEFAULT_DNS', 'not-a-dns-ip'],
    ['WG_MTU', '1000'], ['WG_MTU', '1280junk'],
    ['WG_PERSISTENT_KEEPALIVE', '30-20'], ['WG_PERSISTENT_KEEPALIVE', '65536'],
  ])('rejects invalid %s without rendering a broken profile', (name, value) => {
    expect(() => getClientNetworkSettings({ [name]: value })).toThrow(name);
  });

  it('uses identical framing and settings for config downloads and QR exports', async () => {
    const config = fixture();
    const env = { WG_HOST: 'vpn.example.test', WG_PORT: '53123' };
    const wg = new WireGuard({ env });
    wg.getConfig = async () => config;
    const svg = vi.spyOn(QRCode, 'toString').mockResolvedValue('<svg/>');
    try {
      const downloaded = await wg.getClientConfiguration({ clientId: 'alice' });
      await wg.getClientQRCodeSVG({ clientId: 'alice' });
      expect(svg.mock.calls[0][0]).toBe(downloaded);
      expect(downloaded).toContain(renderAwg31InterfaceLines(config.server));
      expect(downloaded).toContain('AllowedIPs = 0.0.0.0/0');
      expect(downloaded).not.toContain('::/0');
      expect(downloaded).toContain('DNS = 77.88.8.8, 77.88.8.1');
      expect(downloaded).toContain('MTU = 1280');
      expect(downloaded).toContain('Endpoint = vpn.example.test:53123');
      expect(downloaded).toContain('PersistentKeepalive = 20-25');
    } finally {
      svg.mockRestore();
    }
  });

  it('omits blank DNS and correctly brackets an IPv6 endpoint', () => {
    const config = fixture();
    const profile = renderClientProfile(config, config.clients.alice, { WG_HOST: '2001:db8::1', WG_DEFAULT_DNS: '' });
    expect(profile).not.toContain('DNS =');
    expect(profile).toContain('Endpoint = [2001:db8::1]:51820');
  });

  it('rejects an MTU/padding combination exceeding the outer 1500 byte budget', () => {
    const config = fixture();
    expect(() => getClientNetworkSettings({ WG_MTU: '1420' }, config.server)).toThrow('WG_MTU');
    expect(() => renderClientProfile(config, config.clients.alice, { WG_HOST: 'vpn.test', WG_MTU: '1420' })).toThrow('WG_MTU');
  });
});
