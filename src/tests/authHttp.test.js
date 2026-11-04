'use strict';

/* global describe, it, expect, beforeAll, afterAll, afterEach */
const { createServer } = require('node:http');
const { once } = require('node:events');
const {
  createApp, defineEventHandler, fromNodeMiddleware, toNodeListener,
} = require('h3');
const expressSession = require('express-session');
const bcrypt = require('bcryptjs');
const config = require('../config');

describe('API authentication over plain Node HTTP responses', () => {
  const servers = [];
  let auth; let previousHash;
  beforeAll(() => {
    previousHash = config.PASSWORD_HASH;
    config.PASSWORD_HASH = bcrypt.hashSync('test-only-password', 4);
    delete require.cache[require.resolve('../lib/Auth')];
    // Reload the module after injecting this test's password configuration.
    // eslint-disable-next-line global-require
    auth = require('../lib/Auth');
  });
  afterAll(() => {
    config.PASSWORD_HASH = previousHash;
    delete require.cache[require.resolve('../lib/Auth')];
  });
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
  const start = async (portName) => {
    const app = createApp();
    if (portName) {
      app.use(fromNodeMiddleware(expressSession({
        name: auth.sessionCookieName(portName),
        secret: `test-secret-${portName}`,
        resave: false,
        saveUninitialized: false,
      })));
      app.use('/login', defineEventHandler(async (event) => {
        event.node.req.session.authenticated = true;
        await new Promise((resolve, reject) => event.node.req.session.save((err) => (err ? reject(err) : resolve())));
        return { success: true };
      }));
    }
    app.use(fromNodeMiddleware(auth.apiAuthMiddleware));
    app.use('/api/wireguard/client', defineEventHandler(() => [{ id: 'test-client' }]));
    const server = createServer(toNodeListener(app));
    servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  };
  it('returns JSON 401 instead of 500 when a polling session is absent', async () => {
    const base = await start();
    const response = await fetch(`${base}/api/wireguard/client`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Not Logged In' });
  });
  it('returns JSON 401 for an incorrect Authorization password', async () => {
    const base = await start();
    const response = await fetch(`${base}/api/wireguard/client`, { headers: { Authorization: 'wrong' } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Incorrect Password' });
  });
  it('continues to accept a correct Authorization password', async () => {
    const base = await start();
    const response = await fetch(`${base}/api/wireguard/client`, { headers: { Authorization: 'test-only-password' } });
    expect(response.status).toBe(200);
  });
  it('keeps simultaneous admin sessions independent on different ports', async () => {
    const oldPanel = await start('51821'); const newPanel = await start('51823');
    const first = await fetch(`${oldPanel}/login`); const second = await fetch(`${newPanel}/login`);
    const oldCookie = first.headers.get('set-cookie').split(';')[0];
    const newCookie = second.headers.get('set-cookie').split(';')[0];
    expect(oldCookie.split('=')[0]).not.toBe(newCookie.split('=')[0]);
    expect(newCookie).not.toMatch(/^connect\.sid=/);
    const headers = { Cookie: `${oldCookie}; ${newCookie}` };
    expect((await fetch(`${oldPanel}/api/wireguard/client`, { headers })).status).toBe(200);
    expect((await fetch(`${newPanel}/api/wireguard/client`, { headers })).status).toBe(200);
  });
});
