'use strict';

const { isIP } = require('node:net');
const { renderAwg31InterfaceLines } = require('./awg31Config');

const fail = (name) => {
  throw new Error(`Invalid client profile setting ${name}`);
};
const number = (name, value, min, max) => {
  if (!/^\d+$/.test(String(value)) || Number(value) < min || Number(value) > max) fail(name);
  return Number(value);
};
const getClientNetworkSettings = (env = process.env, server) => {
  const dns = env.WG_DEFAULT_DNS ?? '77.88.8.8, 77.88.8.1';
  if (typeof dns !== 'string' || (dns !== '' && dns.split(',').some((ip) => !isIP(ip.trim())))) fail('WG_DEFAULT_DNS');
  const allowedIPs = env.WG_ALLOWED_IPS ?? '0.0.0.0/0';
  if (typeof allowedIPs !== 'string' || allowedIPs.split(',').some((cidr) => {
    const parts = cidr.trim().split('/');
    const family = isIP(parts[0]);
    return parts.length !== 2 || !family || !/^\d+$/.test(parts[1]) || Number(parts[1]) > (family === 4 ? 32 : 128);
  })) fail('WG_ALLOWED_IPS');
  const mtu = number('WG_MTU', env.WG_MTU ?? '1280', 1280, 1420);
  // Inner IP + AWG transport header/authentication + IPv6 outer IP/UDP + S4.
  if (server && mtu + server.s4 + 80 > 1500) fail('WG_MTU (including S4 transport overhead)');
  const keepalive = String(env.WG_PERSISTENT_KEEPALIVE ?? '20-25');
  if (!/^\d+(?:-\d+)?$/.test(keepalive)) fail('WG_PERSISTENT_KEEPALIVE');
  const [min, max = min] = keepalive.split('-').map((value) => number('WG_PERSISTENT_KEEPALIVE', value, 0, 65535));
  if (min > max) fail('WG_PERSISTENT_KEEPALIVE');
  return {
    allowedIPs, dns, mtu, keepalive,
  };
};

const renderClientProfile = (config, client, env = process.env) => {
  const {
    dns, mtu, allowedIPs, keepalive,
  } = getClientNetworkSettings(env, config.server);
  let host = env.WG_HOST;
  if (typeof host !== 'string' || !host || /[\s\r\n\0]/.test(host)) fail('WG_HOST');
  if (isIP(host) === 6) host = `[${host}]`;
  const port = number('WG_CONFIG_PORT', env.WG_CONFIG_PORT ?? env.WG_PORT ?? '51820', 1, 65535);
  const lines = [
    '[Interface]',
    `PrivateKey = ${client.privateKey || 'REPLACE_ME'}`,
    `Address = ${client.address}/24`,
    ...(dns ? [`DNS = ${dns}`] : []),
    `MTU = ${mtu}`,
    renderAwg31InterfaceLines(config.server),
    '',
    '[Peer]',
    `PublicKey = ${config.server.publicKey}`,
    ...(client.preSharedKey ? [`PresharedKey = ${client.preSharedKey}`] : []),
    `AllowedIPs = ${allowedIPs}`,
    `PersistentKeepalive = ${keepalive}`,
    `Endpoint = ${host}:${port}`,
  ];
  return `${lines.join('\n')}\n`;
};

module.exports = { getClientNetworkSettings, renderClientProfile };
