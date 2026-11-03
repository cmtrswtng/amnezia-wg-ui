'use strict';

const fs = require('node:fs/promises');

const interfaceEpoch = async () => {
  const [boot, namespace, index] = await Promise.all([
    fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    fs.readlink('/proc/self/ns/net'),
    fs.readFile('/sys/class/net/wg0/ifindex', 'utf8'),
  ]);
  // A recreated container can reuse the same interface index on the same host.
  return `${boot.trim()}:${namespace}:${index.trim()}`;
};
const parseTrafficDump = (dump) => dump.trim().split('\n').slice(1).flatMap((line) => {
  const [publicKey,,,,, rx, tx] = line.split('\t');
  const receive = Number(rx); const send = Number(tx);
  if (!publicKey || !Number.isSafeInteger(receive) || receive < 0 || !Number.isSafeInteger(send) || send < 0) return [];
  return [{ publicKey, rx: receive, tx: send }];
});

module.exports = { interfaceEpoch, parseTrafficDump };
