'use strict';

const path = require('path');
const { existsSync } = require('node:fs');
const debug = require('debug')('WireGuard');
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const CRC32 = require('crc-32');

const Util = require('./Util');
const ServerError = require('./ServerError');
const AuditLog = require('../services/AuditLog');
const {
  PROTOCOL_VERSION,
  createAwg31Parameters,
  validatePersistedConfig,
  migrateConfigToAwg31,
  renderAwg31InterfaceLines,
} = require('./awg31Config');
const configFiles = require('./configFiles');
const StateStore = require('./StateStore');
const { interfaceEpoch: defaultInterfaceEpoch, parseTrafficDump } = require('./traffic');
const { getClientNetworkSettings, renderClientProfile } = require('./clientProfile');

const audit = (entry) => AuditLog.log(entry).catch(() => {});
const { normalizeTags, isClientExpired, shouldEnableOnExpireUpdate } = require('./clientUtils');
const {
  validateQuotaInput,
  transferDelta,
  isCycleDue,
  isQuotaExceeded,
  quotaCycleEndsAt,
} = require('./quotaUtils');

const {
  WG_PATH,
  WG_HOST,
  WG_PORT,
  WG_DEFAULT_ADDRESS,
  WG_PRE_UP,
  WG_POST_UP,
  WG_PRE_DOWN,
  WG_POST_DOWN,
  WG_ENABLE_ONE_TIME_LINKS,
} = require('../config');

module.exports = class WireGuard {

  constructor({
    wgPath = WG_PATH,
    env = process.env,
    exec = (command, options) => Util.exec(command, options),
    randomInt = crypto.randomInt,
    interfaceEpoch = defaultInterfaceEpoch,
  } = {}) {
    this.wgPath = wgPath;
    this.env = env;
    this.exec = exec;
    this.randomInt = randomInt;
    this.interfaceEpoch = interfaceEpoch;
    this.store = null;
  }

  async __buildConfig() {
    const migration = await Promise.resolve().then(async () => {
      if (!(this.env.WG_HOST ?? WG_HOST)) {
        throw new Error('WG_HOST Environment Variable Not Set!');
      }

      debug('Loading configuration...');
      const databasePath = path.join(this.wgPath, 'state.sqlite');
      if (!this.store && existsSync(databasePath)) this.store = new StateStore(databasePath);
      const stored = this.store?.loadConfig();
      if (stored) {
        validatePersistedConfig(stored);
        return { config: stored, migrated: false };
      }
      const loaded = await configFiles.readJsonConfig(path.join(this.wgPath, 'wg0.json'));
      if (!loaded.exists) {
        const privateKey = await this.exec('wg genkey');
        const publicKey = await this.exec('wg pubkey', {
          input: privateKey,
          log: 'wg pubkey',
        });
        debug('Configuration generated.');
        return {
          config: {
            protocolVersion: PROTOCOL_VERSION,
            server: {
              privateKey,
              publicKey,
              address: WG_DEFAULT_ADDRESS.replace('x', '1'),
              ...createAwg31Parameters({ env: this.env, randomInt: this.randomInt }),
            },
            clients: {},
          },
          migrated: false,
        };
      }

      const result = migrateConfigToAwg31(loaded.config, {
        env: this.env,
        randomInt: this.randomInt,
      });
      if (result.migrated) {
        await configFiles.createBackupOnce(
          path.join(this.wgPath, `wg0.${result.sourceVersion}.backup.json`),
          loaded.raw,
        );
      }
      await configFiles.createBackupOnce(
        path.join(this.wgPath, 'wg0.pre-sqlite.backup.json'), loaded.raw,
      );
      debug('Configuration loaded.');
      return result;
    });

    return migration.config;
  }

  async __initializeConfig() {
    const config = await this.__buildConfig();

    await this.__saveConfig(config);
    // Capture the previous interface before wg-quick recreates its counters.
    const sample = await this.captureTraffic(config, { allowMissingInterface: true });
    if (this.__migrateQuotaCounters(config, sample)) await this.__saveConfig(config);
    await this.exec('wg-quick down wg0').catch(() => {});
    await this.exec('wg-quick up wg0').catch((err) => {
      if (err && err.message && err.message.includes('Cannot find device "wg0"')) {
        throw new Error('WireGuard exited with the error: Cannot find device "wg0"\nThis usually means that your host\'s kernel does not support WireGuard!');
      }

      throw err;
    });
    // await this.exec(`iptables -t nat -A POSTROUTING -s ${WG_DEFAULT_ADDRESS.replace('x', '0')}/24 -o ' + WG_DEVICE + ' -j MASQUERADE`);
    // await this.exec('iptables -A INPUT -p udp -m udp --dport 51820 -j ACCEPT');
    // await this.exec('iptables -A FORWARD -i wg0 -j ACCEPT');
    // await this.exec('iptables -A FORWARD -o wg0 -j ACCEPT');
    await this.__syncConfig();
    return config;
  }

  async getConfig() {
    if (this.__configPromise) {
      return this.__configPromise;
    }
    if (!this.__initializationPromise) {
      this.__initializationPromise = this.__initializeConfig()
        .then((config) => {
          this.__configPromise = Promise.resolve(config);
          return config;
        })
        .finally(() => {
          this.__initializationPromise = undefined;
        });
    }

    return this.__initializationPromise;
  }

  async saveConfig() {
    const config = await this.getConfig();
    if (this.store) await this.captureTraffic(config);
    await this.__saveConfig(config);
    await this.__syncConfig();
  }

  async __saveConfig(config, { replaceTraffic = false } = {}) {
    validatePersistedConfig(config);
    let result = `
# Note: Do not edit this file directly.
# Your changes will be overwritten!

# Server
[Interface]
PrivateKey = ${config.server.privateKey}
Address = ${config.server.address}/24
MTU = ${getClientNetworkSettings(this.env, config.server).mtu}
ListenPort = ${WG_PORT}
PreUp = ${WG_PRE_UP}
PostUp = ${WG_POST_UP}
PreDown = ${WG_PRE_DOWN}
PostDown = ${WG_POST_DOWN}
${renderAwg31InterfaceLines(config.server)}
`;

    for (const [clientId, client] of Object.entries(config.clients)) {
      if (!client.enabled) continue;

      result += `

# Client: ${client.name} (${clientId})
[Peer]
PublicKey = ${client.publicKey}
${client.preSharedKey ? `PresharedKey = ${client.preSharedKey}\n` : ''
}AllowedIPs = ${client.address}/32`;
    }

    debug('Config saving...');
    if (!this.store) this.store = new StateStore(path.join(this.wgPath, 'state.sqlite'));
    this.store.saveConfig(config, { replaceTraffic });
    await configFiles.writeFileAtomic(
      path.join(this.wgPath, 'wg0.json'), JSON.stringify(this.store.loadConfig(), null, 2), 0o600,
    );
    await configFiles.writeFileAtomic(path.join(this.wgPath, 'wg0.conf'), result, 0o600);
    debug('Config saved.');
  }

  async __syncConfig() {
    debug('Config syncing...');
    await this.exec('wg syncconf wg0 <(wg-quick strip wg0)');
    debug('Config synced.');
  }

  async getClients() {
    const config = await this.getConfig();
    const clients = Object.entries(config.clients).map(([clientId, client]) => ({
      id: clientId,
      name: client.name,
      enabled: client.enabled,
      address: client.address,
      publicKey: client.publicKey,
      createdAt: new Date(client.createdAt),
      updatedAt: new Date(client.updatedAt),
      expiredAt: client.expiredAt !== null
        ? new Date(client.expiredAt)
        : null,
      tags: client.tags ?? [],
      isExpired: isClientExpired(client),
      allowedIPs: client.allowedIPs,
      oneTimeLink: client.oneTimeLink ?? null,
      oneTimeLinkExpiresAt: client.oneTimeLinkExpiresAt ?? null,
      quotaBytes: client.quotaBytes ?? null,
      quotaCycleDays: client.quotaCycleDays ?? null,
      quotaCycleStartAt: client.quotaCycleStartAt ?? null,
      quotaUsedBytes: client.quotaUsedBytes ?? 0,
      quotaExceeded: client.quotaExceeded ?? false,
      quotaRemainingBytes: client.quotaBytes != null
        ? Math.max(0, client.quotaBytes - (client.quotaUsedBytes ?? 0))
        : null,
      quotaUsedPercent: client.quotaBytes != null
        ? Math.min(100, Math.round(((client.quotaUsedBytes ?? 0) / client.quotaBytes) * 100))
        : null,
      quotaCycleEndsAt: quotaCycleEndsAt(client),
      downloadableConfig: 'privateKey' in client,
      persistentKeepalive: null,
      latestHandshakeAt: null,
      transferRx: null,
      transferTx: null,
      endpoint: null,
    }));

    // Loop WireGuard status
    const { dump, totals } = await this.captureTraffic(config);
    dump
      .trim()
      .split('\n')
      .slice(1)
      .forEach((line) => {
        const [
          publicKey,
          preSharedKey, // eslint-disable-line no-unused-vars
          endpoint, // eslint-disable-line no-unused-vars
          allowedIps, // eslint-disable-line no-unused-vars
          latestHandshakeAt,
          transferRx,
          transferTx,
          persistentKeepalive,
        ] = line.split('\t');

        const client = clients.find((client) => client.publicKey === publicKey);
        if (!client) return;

        client.latestHandshakeAt = latestHandshakeAt === '0'
          ? null
          : new Date(Number(`${latestHandshakeAt}000`));
        client.endpoint = endpoint === '(none)' ? null : endpoint;
        client.transferRx = Number(transferRx);
        client.transferTx = Number(transferTx);
        client.persistentKeepalive = persistentKeepalive;
      });

    if (this.store) {
      for (const client of clients) {
        client.transferRx = totals[client.id]?.rx ?? 0;
        client.transferTx = totals[client.id]?.tx ?? 0;
      }
    }
    return clients;
  }

  async captureTraffic(config, { allowMissingInterface = false } = {}) {
    if (!config) config = await this.getConfig();
    if (this.__trafficPromise) return this.__trafficPromise;
    this.__trafficPromise = (async () => {
      const dump = await this.exec('wg show wg0 dump', { log: false }).catch((err) => {
        if (!allowMissingInterface) throw err;
        debug('No previous interface counters available: %s', err.message);
        return '';
      });
      const observations = parseTrafficDump(dump);
      if (this.store && observations.length) {
        this.store.recordTraffic(await this.interfaceEpoch(), observations);
      }
      return { dump, observations, totals: this.store?.getTraffic() ?? {} };
    })();
    try {
      return await this.__trafficPromise;
    } finally {
      this.__trafficPromise = null;
    }
  }

  __migrateQuotaCounters(config, { observations = [], totals = {} } = {}) {
    let changed = false;
    const raw = new Map(observations.map((sample) => [sample.publicKey, sample]));
    for (const [id, client] of Object.entries(config.clients)) {
      if (client.quotaCounterVersion === 1) continue;
      const pending = raw.get(client.publicKey);
      // JSON-era cursors measured the old kernel interface, not lifetime totals.
      // Charge any still-readable pending bytes, then change the cursor domain.
      if (pending && client.quotaBytes) {
        client.quotaUsedBytes = (client.quotaUsedBytes ?? 0)
          + transferDelta(client.quotaLastRx, client.quotaLastTx, pending.rx, pending.tx);
      }
      client.quotaLastRx = totals[id]?.rx ?? client.transferRxTotal ?? 0;
      client.quotaLastTx = totals[id]?.tx ?? client.transferTxTotal ?? 0;
      client.quotaCounterVersion = 1;
      changed = true;
    }
    return changed;
  }

  startTrafficSampling() {
    if (this.__trafficTimer) return;
    this.__trafficTimer = setInterval(() => {
      this.captureTraffic().catch((err) => debug('Traffic sampling failed: %s', err.message));
    }, 5000);
    this.__trafficTimer.unref();
  }

  async getClient({ clientId }) {
    const config = await this.getConfig();
    const client = config.clients[clientId];
    if (!client) {
      throw new ServerError(`Client Not Found: ${clientId}`, 404);
    }

    return client;
  }

  async getClientConfiguration({ clientId }) {
    const config = await this.getConfig();
    const client = await this.getClient({ clientId });

    return renderClientProfile(config, client, this.env);
  }

  async getClientQRCodeSVG({ clientId }) {
    const config = await this.getClientConfiguration({ clientId });
    return QRCode.toString(config, {
      type: 'svg',
      width: 512,
    });
  }

  async createClient({
    name, expiredDate, tags, quotaBytes, quotaCycleDays,
  }) {
    if (!name) {
      throw new Error('Missing: Name');
    }

    const config = await this.getConfig();

    const privateKey = await this.exec('wg genkey');
    const publicKey = await this.exec('wg pubkey', {
      input: privateKey,
      log: 'wg pubkey',
    });
    const preSharedKey = await this.exec('wg genpsk');

    const quota = validateQuotaInput({ quotaBytes, quotaCycleDays });

    // Calculate next IP
    let address;
    for (let i = 2; i < 255; i++) {
      const client = Object.values(config.clients).find((client) => {
        return client.address === WG_DEFAULT_ADDRESS.replace('x', i);
      });

      if (!client) {
        address = WG_DEFAULT_ADDRESS.replace('x', i);
        break;
      }
    }

    if (!address) {
      throw new Error('Maximum number of clients reached.');
    }
    // Create Client
    const id = crypto.randomUUID();
    const client = {
      id,
      name,
      address,
      privateKey,
      publicKey,
      preSharedKey,

      createdAt: new Date(),
      updatedAt: new Date(),
      expiredAt: null,
      enabled: true,
      tags: normalizeTags(tags),
      quotaBytes: quota.quotaBytes,
      quotaCycleDays: quota.quotaCycleDays,
      quotaCycleStartAt: quota.quotaBytes ? new Date() : null,
      quotaUsedBytes: 0,
      quotaLastRx: null,
      quotaLastTx: null,
      quotaExceeded: false,
    };
    if (expiredDate) {
      client.expiredAt = new Date(expiredDate);
    }
    config.clients[id] = client;

    await this.saveConfig();

    audit({
      actor: 'admin', action: 'client.create', clientId: id, clientName: name,
    });

    return client;
  }

  async deleteClient({ clientId }) {
    const config = await this.getConfig();

    if (config.clients[clientId]) {
      const clientName = config.clients[clientId].name;
      delete config.clients[clientId];
      await this.saveConfig();

      audit({
        actor: 'admin', action: 'client.delete', clientId, clientName,
      });
    }
  }

  async enableClient({ clientId }) {
    const client = await this.getClient({ clientId });

    client.enabled = true;
    if (client.quotaExceeded) {
      client.quotaUsedBytes = 0;
      client.quotaCycleStartAt = new Date();
      client.quotaExceeded = false;
    }
    client.updatedAt = new Date();

    await this.saveConfig();

    audit({
      actor: 'admin', action: 'client.enable', clientId, clientName: client.name,
    });
  }

  async generateOneTimeLink({ clientId }) {
    const client = await this.getClient({ clientId });
    const key = `${clientId}-${Math.floor(Math.random() * 1000)}`;
    client.oneTimeLink = Math.abs(CRC32.str(key)).toString(16);
    client.oneTimeLinkExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    client.updatedAt = new Date();
    await this.saveConfig();

    audit({
      actor: 'admin', action: 'client.oneTimeLink', clientId, clientName: client.name,
    });
  }

  async eraseOneTimeLink({ clientId }) {
    const client = await this.getClient({ clientId });
    // client.oneTimeLink = null;
    client.oneTimeLinkExpiresAt = new Date(Date.now() + 10 * 1000);
    client.updatedAt = new Date();
    await this.saveConfig();
  }

  async disableClient({ clientId }) {
    const client = await this.getClient({ clientId });

    client.enabled = false;
    client.updatedAt = new Date();

    await this.saveConfig();

    audit({
      actor: 'admin', action: 'client.disable', clientId, clientName: client.name,
    });
  }

  async updateClientName({ clientId, name }) {
    const client = await this.getClient({ clientId });

    client.name = name;
    client.updatedAt = new Date();

    await this.saveConfig();

    audit({
      actor: 'admin', action: 'client.rename', clientId, clientName: client.name, details: { name },
    });
  }

  async setClientTags({ clientId, tags }) {
    const client = await this.getClient({ clientId });

    client.tags = normalizeTags(tags);
    client.updatedAt = new Date();

    await this.saveConfig();

    audit({
      actor: 'admin',
      action: 'client.tags',
      clientId,
      clientName: client.name,
      details: { tags: client.tags },
    });
  }

  async setClientQuota({ clientId, quotaBytes, quotaCycleDays }) {
    const client = await this.getClient({ clientId });
    const quota = validateQuotaInput({ quotaBytes, quotaCycleDays });

    if (quota.quotaBytes === null) {
      client.quotaBytes = null;
      client.quotaCycleDays = null;
      client.quotaCycleStartAt = null;
      client.quotaUsedBytes = 0;
      client.quotaExceeded = false;
      client.quotaLastRx = null;
      client.quotaLastTx = null;
    } else {
      const hadQuota = typeof client.quotaBytes === 'number' && client.quotaBytes > 0;
      client.quotaBytes = quota.quotaBytes;
      client.quotaCycleDays = quota.quotaCycleDays;
      if (!hadQuota) {
        client.quotaCycleStartAt = new Date();
        client.quotaUsedBytes = 0;
        client.quotaExceeded = false;
        client.quotaLastRx = null;
        client.quotaLastTx = null;
      } else if (client.quotaExceeded && !isQuotaExceeded(client)) {
        client.quotaExceeded = false;
        const expired = client.expiredAt != null && new Date() > new Date(client.expiredAt);
        if (!expired) {
          client.enabled = true;
        }
      }
    }
    client.updatedAt = new Date();

    await this.saveConfig();

    audit({
      actor: 'admin',
      action: 'client.quota',
      clientId,
      clientName: client.name,
      details: { quotaBytes: client.quotaBytes, quotaCycleDays: client.quotaCycleDays },
    });
  }

  async resetClientQuota({ clientId }) {
    const client = await this.getClient({ clientId });

    client.quotaUsedBytes = 0;
    client.quotaCycleStartAt = new Date();
    client.quotaExceeded = false;
    const expired = client.expiredAt != null && new Date() > new Date(client.expiredAt);
    if (!expired) {
      client.enabled = true;
    }
    client.updatedAt = new Date();

    await this.saveConfig();

    audit({
      actor: 'admin', action: 'client.quotaReset', clientId, clientName: client.name,
    });
  }

  async updateClientAddress({ clientId, address }) {
    const client = await this.getClient({ clientId });

    if (!Util.isValidIPv4(address)) {
      throw new ServerError(`Invalid Address: ${address}`, 400);
    }

    client.address = address;
    client.updatedAt = new Date();

    await this.saveConfig();

    audit({
      actor: 'admin',
      action: 'client.address',
      clientId,
      clientName: client.name,
      details: { address },
    });
  }

  async updateClientExpireDate({ clientId, expireDate }) {
    const client = await this.getClient({ clientId });

    const shouldEnable = shouldEnableOnExpireUpdate(client, expireDate);

    if (expireDate) {
      client.expiredAt = new Date(expireDate);
    } else {
      client.expiredAt = null;
    }
    if (shouldEnable) {
      client.enabled = true;
    }
    const renewsClient = expireDate != null && new Date(expireDate) > new Date();
    if (renewsClient && client.quotaBytes) {
      client.quotaUsedBytes = 0;
      client.quotaCycleStartAt = new Date();
      client.quotaExceeded = false;
    }
    client.updatedAt = new Date();

    await this.saveConfig();

    audit({
      actor: 'admin',
      action: 'client.expireDate',
      clientId,
      clientName: client.name,
      details: { expireDate },
    });
  }

  async __reloadConfig() {
    const config = await this.__buildConfig();
    this.__configPromise = Promise.resolve(config);
    await this.__syncConfig();
  }

  async restoreConfiguration(config) {
    debug('Starting configuration restore process.');
    let parsed;
    try {
      parsed = JSON.parse(config);
    } catch {
      throw new Error('Cannot parse restored WireGuard configuration');
    }
    const result = migrateConfigToAwg31(parsed, { env: this.env, randomInt: this.randomInt });
    if (this.store) await this.captureTraffic();
    const snapshot = this.store?.loadConfig();
    const current = snapshot
      ? { exists: true, raw: JSON.stringify(snapshot, null, 2) }
      : await configFiles.readJsonConfig(path.join(this.wgPath, 'wg0.json'));
    if (current.exists) {
      await configFiles.createBackupOnce(
        path.join(this.wgPath, `wg0.pre-restore.${crypto.randomUUID()}.json`), current.raw,
      );
    }
    if (result.migrated) {
      await configFiles.createBackupOnce(
        path.join(this.wgPath, `wg0.restore.${result.sourceVersion}.${crypto.randomUUID()}.json`), config,
      );
    }
    this.__migrateQuotaCounters(result.config);
    await this.__saveConfig(result.config, { replaceTraffic: true });
    await this.__reloadConfig();
    debug('Configuration restore process completed.');

    audit({ actor: 'admin', action: 'config.restore' });
  }

  async backupConfiguration() {
    debug('Starting configuration backup.');
    const config = await this.getConfig();
    if (this.store) await this.captureTraffic(config);
    const backup = JSON.stringify(this.store?.loadConfig() ?? config, null, 2);
    debug('Configuration backup completed.');
    return backup;
  }

  // Shutdown wireguard
  async Shutdown() {
    clearInterval(this.__trafficTimer);
    this.__trafficTimer = null;
    if (this.store) await this.captureTraffic().catch((err) => debug('Final traffic sample failed: %s', err.message));
    await this.exec('wg-quick down wg0').catch(() => {});
  }

  async cronJobEveryMinute() {
    try {
      const config = await this.getConfig();
      let needSaveConfig = false;
      // Expires Feature (always on)
      for (const client of Object.values(config.clients)) {
        if (client.enabled !== true) continue;
        if (client.expiredAt !== null && client.expiredAt !== undefined && new Date() > new Date(client.expiredAt)) {
          debug(`Client ${client.id} expired.`);
          needSaveConfig = true;
          client.enabled = false;
          client.updatedAt = new Date();
          audit({
            actor: 'system',
            action: 'system.expired',
            clientId: client.id,
            clientName: client.name,
          });
        }
      }
      // Quota Feature (always on; per-client, unlimited by default)
      const quotaClients = Object.values(config.clients)
        .filter((client) => typeof client.quotaBytes === 'number' && client.quotaBytes > 0);
      if (quotaClients.length > 0) {
        // 1. Cycle rollover
        for (const client of quotaClients) {
          if (!isCycleDue(client)) continue;
          debug(`Client ${client.id} quota cycle rolled over.`);
          needSaveConfig = true;
          client.quotaUsedBytes = 0;
          client.quotaCycleStartAt = new Date();
          if (client.quotaExceeded) {
            client.quotaExceeded = false;
            const expired = client.expiredAt != null && new Date() > new Date(client.expiredAt);
            if (!expired && client.enabled !== true) {
              client.enabled = true;
              audit({
                actor: 'system',
                action: 'system.quotaRollover',
                clientId: client.id,
                clientName: client.name,
              });
            }
          }
          client.updatedAt = new Date();
        }
        // 2. Accrue transfer deltas
        const { observations, totals } = await this.captureTraffic(config);
        const counters = new Map(observations.map((sample) => [sample.publicKey, { rx: sample.rx, tx: sample.tx }]));
        if (this.store) {
          for (const [id, client] of Object.entries(config.clients)) {
            if (totals[id]) counters.set(client.publicKey, totals[id]);
          }
        }
        for (const client of quotaClients) {
          const current = counters.get(client.publicKey);
          if (!current) continue;
          const delta = transferDelta(client.quotaLastRx, client.quotaLastTx, current.rx, current.tx);
          client.quotaLastRx = current.rx;
          client.quotaLastTx = current.tx;
          if (delta > 0) {
            needSaveConfig = true;
            client.quotaUsedBytes = (client.quotaUsedBytes ?? 0) + delta;
          }
        }
        // 3. Disable on exceed
        for (const client of quotaClients) {
          if (client.enabled !== true || client.quotaExceeded) continue;
          if (isQuotaExceeded(client)) {
            debug(`Client ${client.id} quota exceeded.`);
            needSaveConfig = true;
            client.enabled = false;
            client.quotaExceeded = true;
            client.updatedAt = new Date();
            audit({
              actor: 'system',
              action: 'system.quotaExceeded',
              clientId: client.id,
              clientName: client.name,
            });
          }
        }
      }
      // One Time Link Feature
      if (WG_ENABLE_ONE_TIME_LINKS === 'true') {
        for (const client of Object.values(config.clients)) {
          if (client.oneTimeLink !== null && new Date() > new Date(client.oneTimeLinkExpiresAt)) {
            debug(`Client ${client.id} One Time Link expired.`);
            needSaveConfig = true;
            client.oneTimeLink = null;
            client.oneTimeLinkExpiresAt = null;
            client.updatedAt = new Date();
          }
        }
      }
      if (needSaveConfig) {
        await this.saveConfig();
      }
    } catch (err) {
      debug('cronJobEveryMinute failed: %O', err);
    }
  }

  async getMetrics() {
    const clients = await this.getClients();
    let wireguardPeerCount = 0;
    let wireguardEnabledPeersCount = 0;
    let wireguardConnectedPeersCount = 0;
    let wireguardSentBytes = '';
    let wireguardReceivedBytes = '';
    let wireguardLatestHandshakeSeconds = '';
    for (const client of Object.values(clients)) {
      wireguardPeerCount++;
      if (client.enabled === true) {
        wireguardEnabledPeersCount++;
      }
      if (client.endpoint !== null) {
        wireguardConnectedPeersCount++;
      }
      wireguardSentBytes += `wireguard_sent_bytes{interface="wg0",enabled="${client.enabled}",address="${client.address}",name="${client.name}"} ${Number(client.transferTx)}\n`;
      wireguardReceivedBytes += `wireguard_received_bytes{interface="wg0",enabled="${client.enabled}",address="${client.address}",name="${client.name}"} ${Number(client.transferRx)}\n`;
      wireguardLatestHandshakeSeconds += `wireguard_latest_handshake_seconds{interface="wg0",enabled="${client.enabled}",address="${client.address}",name="${client.name}"} ${client.latestHandshakeAt ? (new Date().getTime() - new Date(client.latestHandshakeAt).getTime()) / 1000 : 0}\n`;
    }

    let returnText = '# HELP wg-easy and wireguard metrics\n';

    returnText += '\n# HELP wireguard_configured_peers\n';
    returnText += '# TYPE wireguard_configured_peers gauge\n';
    returnText += `wireguard_configured_peers{interface="wg0"} ${Number(wireguardPeerCount)}\n`;

    returnText += '\n# HELP wireguard_enabled_peers\n';
    returnText += '# TYPE wireguard_enabled_peers gauge\n';
    returnText += `wireguard_enabled_peers{interface="wg0"} ${Number(wireguardEnabledPeersCount)}\n`;

    returnText += '\n# HELP wireguard_connected_peers\n';
    returnText += '# TYPE wireguard_connected_peers gauge\n';
    returnText += `wireguard_connected_peers{interface="wg0"} ${Number(wireguardConnectedPeersCount)}\n`;

    returnText += '\n# HELP wireguard_sent_bytes Bytes sent to the peer\n';
    returnText += '# TYPE wireguard_sent_bytes counter\n';
    returnText += `${wireguardSentBytes}`;

    returnText += '\n# HELP wireguard_received_bytes Bytes received from the peer\n';
    returnText += '# TYPE wireguard_received_bytes counter\n';
    returnText += `${wireguardReceivedBytes}`;

    returnText += '\n# HELP wireguard_latest_handshake_seconds UNIX timestamp seconds of the last handshake\n';
    returnText += '# TYPE wireguard_latest_handshake_seconds gauge\n';
    returnText += `${wireguardLatestHandshakeSeconds}`;

    return returnText;
  }

  async getMetricsJSON() {
    const clients = await this.getClients();
    let wireguardPeerCount = 0;
    let wireguardEnabledPeersCount = 0;
    let wireguardConnectedPeersCount = 0;
    for (const client of Object.values(clients)) {
      wireguardPeerCount++;
      if (client.enabled === true) {
        wireguardEnabledPeersCount++;
      }
      if (client.endpoint !== null) {
        wireguardConnectedPeersCount++;
      }
    }
    return {
      wireguard_configured_peers: Number(wireguardPeerCount),
      wireguard_enabled_peers: Number(wireguardEnabledPeersCount),
      wireguard_connected_peers: Number(wireguardConnectedPeersCount),
    };
  }

};
