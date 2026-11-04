'use strict';

const { isIP } = require('node:net');
const { WG_DEVICE, WG_PORT } = require('../config');

const addressTemplate = (server) => {
  if (isIP(server.address) !== 4) throw new Error('Server tunnel address must be IPv4');
  return `${server.address.slice(0, server.address.lastIndexOf('.') + 1)}x`;
};

const interfaceHooks = (server, env) => {
  const subnet = `${addressTemplate(server).replace('x', '0')}/24`;
  const device = env.WG_DEVICE || WG_DEVICE;
  const port = env.WG_PORT || WG_PORT;
  const rules = (action) => [
    `iptables -t nat -${action} POSTROUTING -s ${subnet} -o ${device} -j MASQUERADE;`,
    `iptables -${action} INPUT -p udp -m udp --dport ${port} -j ACCEPT;`,
    `iptables -${action} FORWARD -i wg0 -j ACCEPT;`,
    `iptables -${action} FORWARD -o wg0 -j ACCEPT;`,
  ].join(' ');
  return {
    preUp: env.WG_PRE_UP || '',
    postUp: env.WG_POST_UP || rules('A'),
    preDown: env.WG_PRE_DOWN || '',
    postDown: env.WG_POST_DOWN || rules('D'),
  };
};

module.exports = { addressTemplate, interfaceHooks };
