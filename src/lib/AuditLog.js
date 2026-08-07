'use strict';

const fs = require('node:fs/promises');

const MAX_LINES = 6000;
const KEEP_LINES = 5000;

/**
 * Append-only JSONL audit log. Audit failures are swallowed:
 * logging must never break business logic.
 */
module.exports = class AuditLog {

  constructor(filePath) {
    this.filePath = filePath;
    this.__writeQueue = Promise.resolve();
  }

  async log({
    actor, action, clientId = null, clientName = null, details = null,
  }) {
    const entry = {
      ts: new Date().toISOString(),
      actor,
      action,
      clientId,
      clientName,
      details,
    };

    this.__writeQueue = this.__writeQueue
      .then(async () => {
        await this.__rotateIfNeeded();
        await fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8');
      })
      .catch(() => {});

    return this.__writeQueue;
  }

  async __rotateIfNeeded() {
    const content = await fs.readFile(this.filePath, 'utf8').catch(() => '');
    if (!content) return;

    const lines = content.trim().split('\n');
    if (lines.length <= MAX_LINES) return;

    await fs.writeFile(this.filePath, `${lines.slice(-KEEP_LINES).join('\n')}\n`, 'utf8');
  }

  async getEntries({ limit = 200 } = {}) {
    const content = await fs.readFile(this.filePath, 'utf8').catch(() => '');
    if (!content.trim()) return [];

    return content
      .trim()
      .split('\n')
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse()
      .slice(0, limit);
  }

};
