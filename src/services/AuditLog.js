'use strict';

const path = require('path');

const AuditLog = require('../lib/AuditLog');

const { WG_PATH } = require('../config');

module.exports = new AuditLog(path.join(WG_PATH, 'audit.jsonl'));
