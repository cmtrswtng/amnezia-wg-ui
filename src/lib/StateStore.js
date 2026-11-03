'use strict';

const fs = require('node:fs');
const path = require('node:path');
// node:sqlite is built into our Node 24 runtime; the legacy ESLint resolver predates it.
// eslint-disable-next-line import/no-unresolved, node/no-missing-require
const { DatabaseSync } = require('node:sqlite');

const counter = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid traffic counter');
  return value;
};
const APPLICATION_ID = 0x41574755;

// Each operation owns its connection. Transactions serialize config/cursor writes,
// and no connection survives a shutdown or keeps a backup file open on Windows.
module.exports = class StateStore {

  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    try {
      fs.closeSync(fs.openSync(filePath, 'wx', 0o600));
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    fs.chmodSync(filePath, 0o600);
    this.withDatabase((db) => {
      const version = db.prepare('PRAGMA user_version').get().user_version;
      const applicationId = db.prepare('PRAGMA application_id').get().application_id;
      if ((version !== 0 && version !== 1) || (applicationId !== 0 && applicationId !== APPLICATION_ID)) {
        throw new Error('Unsupported Amnezia SQLite database version');
      }
      db.exec(`
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS traffic (
          client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
          public_key TEXT NOT NULL,
          total_rx INTEGER NOT NULL DEFAULT 0 CHECK(total_rx >= 0),
          total_tx INTEGER NOT NULL DEFAULT 0 CHECK(total_tx >= 0),
          last_rx INTEGER NOT NULL DEFAULT 0,
          last_tx INTEGER NOT NULL DEFAULT 0,
          epoch TEXT
        );
        PRAGMA user_version=1;
        PRAGMA application_id=${APPLICATION_ID};
      `);
    });
  }

  withDatabase(operation, transaction = false) {
    const db = new DatabaseSync(this.filePath, { timeout: 5000 });
    try {
      db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
      if (transaction) db.exec('BEGIN IMMEDIATE');
      const result = operation(db);
      if (transaction) db.exec('COMMIT');
      return result;
    } catch (err) {
      if (transaction) {
        try {
          db.exec('ROLLBACK');
        } catch { /* transaction may not have started */ }
      }
      throw err;
    } finally {
      db.close();
    }
  }

  loadConfig() {
    return this.withDatabase((db) => {
      const state = db.prepare("SELECT data FROM state WHERE key='config'").get();
      if (!state) return null;
      const config = JSON.parse(state.data);
      config.clients = Object.fromEntries(db.prepare(`
        SELECT c.id, c.data, t.total_rx, t.total_tx FROM clients c
        LEFT JOIN traffic t ON t.client_id=c.id
      `).all().map((row) => [row.id, {
        ...JSON.parse(row.data), transferRxTotal: row.total_rx ?? 0, transferTxTotal: row.total_tx ?? 0,
      }]));
      return config;
    });
  }

  saveConfig(config, { replaceTraffic = false } = {}) {
    return this.withDatabase((db) => {
      const { clients, ...root } = config;
      db.prepare("INSERT INTO state(key,data) VALUES('config',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(JSON.stringify(root));
      const existing = db.prepare('SELECT id,data FROM clients').all();
      const previous = new Map(existing.map((row) => [row.id, JSON.parse(row.data)]));
      const save = db.prepare('INSERT INTO clients(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');
      const addTraffic = db.prepare('INSERT INTO traffic(client_id,public_key,total_rx,total_tx) VALUES(?,?,?,?) ON CONFLICT(client_id) DO NOTHING');
      for (const [id, client] of Object.entries(clients)) {
        const { transferRxTotal, transferTxTotal, ...data } = client;
        save.run(id, JSON.stringify(data));
        addTraffic.run(id, client.publicKey, counter(transferRxTotal ?? 0), counter(transferTxTotal ?? 0));
        if (replaceTraffic) {
          // Keep the current kernel cursor. Restoring an old total must not add
          // all bytes from the still-running interface a second time.
          db.prepare('UPDATE traffic SET total_rx=?,total_tx=? WHERE client_id=?')
            .run(counter(transferRxTotal ?? 0), counter(transferTxTotal ?? 0), id);
        }
        const old = previous.get(id);
        if (old && (old.publicKey !== client.publicKey || (!old.enabled && client.enabled))) {
          db.prepare('UPDATE traffic SET public_key=?,last_rx=0,last_tx=0 WHERE client_id=?').run(client.publicKey, id);
        }
      }
      const remove = db.prepare('DELETE FROM clients WHERE id=?');
      for (const row of existing) if (!Object.hasOwn(clients, row.id)) remove.run(row.id);
    }, true);
  }

  recordTraffic(epoch, observations) {
    if (typeof epoch !== 'string' || !epoch) throw new Error('Invalid traffic interface epoch');
    return this.withDatabase((db) => {
      const peers = new Map(db.prepare('SELECT * FROM traffic').all().map((row) => [row.public_key, row]));
      const update = db.prepare('UPDATE traffic SET total_rx=?,total_tx=?,last_rx=?,last_tx=?,epoch=? WHERE client_id=?');
      for (const sample of observations) {
        const rx = counter(sample.rx); const tx = counter(sample.tx);
        const row = peers.get(sample.publicKey);
        if (!row) continue;
        const sameInterface = row.epoch === epoch;
        const deltaRx = sameInterface && rx >= row.last_rx ? rx - row.last_rx : rx;
        const deltaTx = sameInterface && tx >= row.last_tx ? tx - row.last_tx : tx;
        if (sameInterface && rx === row.last_rx && tx === row.last_tx) continue;
        const totalRx = counter(row.total_rx + deltaRx); const totalTx = counter(row.total_tx + deltaTx);
        update.run(totalRx, totalTx, rx, tx, epoch, row.client_id);
        Object.assign(row, {
          total_rx: totalRx, total_tx: totalTx, last_rx: rx, last_tx: tx, epoch,
        });
      }
    }, true);
  }

  getTraffic() {
    return this.withDatabase((db) => Object.fromEntries(db.prepare('SELECT client_id,total_rx,total_tx FROM traffic').all()
      .map((row) => [row.client_id, { rx: row.total_rx, tx: row.total_tx }])));
  }

};
