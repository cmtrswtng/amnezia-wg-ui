# AmneziaWG 2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the managed VPN interface and generated profiles to a pinned AmneziaWG 2 backend while preserving persisted clients and providing a safe one-time migration and rollback path.

**Architecture:** Put AWG 2 generation, validation, migration, and rendering in a pure CommonJS module; put backup and atomic-write operations in a focused filesystem module; keep `WireGuard` responsible for orchestration. Migrate legacy JSON once, retain all keys and client metadata, render matching AWG 2 server/client parameters, then verify the pinned `linux/amd64` container separately from the Node test suite.

**Tech Stack:** Node.js 18, CommonJS, Vitest 2, Docker/Alpine, `amneziavpn/amneziawg-go:2.0.0`, GitHub Actions.

## Global Constraints

- Target only `linux/amd64`; ARM publishing is out of scope.
- Pin the backend to `amneziavpn/amneziawg-go:2.0.0`; do not use `latest`.
- Preserve server/client keys and every client-management field during migration.
- Previously downloaded profiles may break; newly downloaded profiles must work with AWG 2.
- Defaults: `Jc=4..8`, `Jmin=64`, `Jmax=512`, `S1..S3=15..64`, `S4=8..32`, unique `H1..H4=5..2147483647`, empty `I1..I5`.
- Existing `S1`, `S2`, `H1..H4`, `JC`, `JMIN`, and `JMAX` environment overrides remain supported; add `S3`, `S4`, and `I1..I5`.
- A missing JSON file means a fresh install; malformed JSON is fatal and must not silently create a new server.
- Any local modifications present at execution time belong to the user and must not
  be committed unless a task explicitly modifies the overlapping lines.
- Never log private keys, preshared keys, raw JSON, or complete generated profiles.

## File Map

- Create `src/lib/awgConfig.js`: pure AWG 2 parsing, defaults, validation, legacy migration, and interface-line rendering.
- Create `src/lib/configFiles.js`: read JSON distinctly from ENOENT, exclusive backup creation, and atomic writes.
- Create `src/tests/awgConfig.test.js`: deterministic unit tests for AWG 2 behavior.
- Create `src/tests/configFiles.test.js`: real temporary-directory tests for safe persistence.
- Create `src/tests/wireGuardAwg2.test.js`: startup migration and server/client rendering tests around `WireGuard`.
- Modify `src/lib/WireGuard.js`: orchestrate fresh creation, migration, backup, atomic persistence, and AWG 2 rendering.
- Modify `src/config.js`: remove module-load random AWG defaults; retain unrelated application configuration.
- Modify `Dockerfile`: pin the AWG 2 image and add an AWG-aware health check.
- Modify `.github/workflows/deploy.yml`: publish only `linux/amd64` and gate publishing on tests and image smoke checks.
- Modify `.env.example`, `README.md`, and `docs/changelog.json`: document migration, variables, rollback, diagnostics, and client verification.

---

### Task 1: Pure AWG 2 Configuration Model

**Files:**
- Create: `src/lib/awgConfig.js`
- Create: `src/tests/awgConfig.test.js`

**Interfaces:**
- Produces: `createAwg2Parameters({ env, randomInt }) -> object`
- Produces: `validateAwg2Parameters(server) -> server`
- Produces: `migrateConfigToAwg2(config, options) -> { config, migrated }`
- Produces: `renderAwg2InterfaceLines(server) -> string`
- Produces: `PROTOCOL_VERSION = 2`

- [ ] **Step 1: Add failing tests for deterministic defaults and environment overrides**

Create `src/tests/awgConfig.test.js` with a deterministic generator and assertions that zero-valued overrides are respected:

```js
'use strict';

/* global describe, it, expect */

const {
  createAwg2Parameters,
  validateAwg2Parameters,
  migrateConfigToAwg2,
  renderAwg2InterfaceLines,
} = require('../lib/awgConfig');

const sequentialRandom = () => {
  const offsets = new Map();
  return (min, maxExclusive) => {
    const key = `${min}:${maxExclusive}`;
    const width = maxExclusive - min;
    const offset = offsets.get(key) ?? 0;
    const value = min + (offset % width);
    offsets.set(key, offset + 1);
    return value;
  };
};

describe('createAwg2Parameters', () => {
  it('creates deterministic values inside the cross-platform preset', () => {
    const result = createAwg2Parameters({ env: {}, randomInt: sequentialRandom() });

    expect(result).toMatchObject({
      jc: 4,
      jmin: 64,
      jmax: 512,
      s1: 15,
      s2: 16,
      s3: 17,
      s4: 8,
      i1: '',
      i2: '',
      i3: '',
      i4: '',
      i5: '',
    });
    expect(new Set([result.h1, result.h2, result.h3, result.h4]).size).toBe(4);
  });

  it('accepts explicit zero values instead of replacing them with defaults', () => {
    const result = createAwg2Parameters({
      env: { JC: '0', S3: '0', S4: '0', I1: '<b 0x0102>' },
      randomInt: sequentialRandom(),
    });

    expect(result.jc).toBe(0);
    expect(result.s3).toBe(0);
    expect(result.s4).toBe(0);
    expect(result.i1).toBe('<b 0x0102>');
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run:

```bash
npm --prefix src test -- tests/awgConfig.test.js
```

Expected: FAIL because `../lib/awgConfig` does not exist.

- [ ] **Step 3: Implement strict integer parsing and AWG 2 preset generation**

Create `src/lib/awgConfig.js` with these constants and functions:

```js
'use strict';

const crypto = require('node:crypto');

const PROTOCOL_VERSION = 2;

const parseInteger = (name, value) => {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid AWG 2 parameter ${name}: expected a base-10 integer`);
  }
  return Number(value);
};

const envInteger = (env, name, fallback) => (
  env[name] === undefined ? fallback() : parseInteger(name, env[name])
);

const createAwg2Parameters = ({
  env = process.env,
  randomInt = crypto.randomInt,
} = {}) => {
  const random = (min, max) => randomInt(min, max + 1);
  const result = {
    jc: envInteger(env, 'JC', () => random(4, 8)),
    jmin: envInteger(env, 'JMIN', () => 64),
    jmax: envInteger(env, 'JMAX', () => 512),
    s1: envInteger(env, 'S1', () => random(15, 64)),
    s2: envInteger(env, 'S2', () => random(15, 64)),
    s3: envInteger(env, 'S3', () => random(15, 64)),
    s4: envInteger(env, 'S4', () => random(8, 32)),
    i1: env.I1 ?? '',
    i2: env.I2 ?? '',
    i3: env.I3 ?? '',
    i4: env.I4 ?? '',
    i5: env.I5 ?? '',
  };

  const headerNames = ['H1', 'H2', 'H3', 'H4'];
  const explicitHeaders = headerNames
    .filter((name) => env[name] !== undefined)
    .map((name) => parseInteger(name, env[name]));
  const usedHeaders = new Set(explicitHeaders);
  headerNames.forEach((name) => {
    const field = name.toLowerCase();
    if (env[name] !== undefined) {
      result[field] = parseInteger(name, env[name]);
      return;
    }
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = random(5, 2_147_483_647);
      if (!usedHeaders.has(candidate)) {
        result[field] = candidate;
        usedHeaders.add(candidate);
        return;
      }
    }
    throw new Error(`Cannot generate unique AWG 2 parameter ${name}`);
  });

  return validateAwg2Parameters(result);
};
```

Do not silently alter explicit environment overrides; duplicate explicit headers
must fail validation after all four values have been collected.

- [ ] **Step 4: Add failing boundary and collision tests**

Append tests covering malformed numeric strings, every lower/upper boundary, `Jmin > Jmax`, `Jmax >= 1280`, duplicate headers, non-string `I1`, and exhaustion of generated header uniqueness. Assert errors name the exact field, for example:

```js
expect(() => validateAwg2Parameters({
  jc: 4, jmin: 64, jmax: 512,
  s1: 15, s2: 16, s3: 17, s4: 8,
  h1: 100, h2: 100, h3: 102, h4: 103,
  i1: '', i2: '', i3: '', i4: '', i5: '',
})).toThrow('Invalid AWG 2 parameter H2: header values must be unique');
```

- [ ] **Step 5: Run the boundary tests and verify they fail**

Run:

```bash
npm --prefix src test -- tests/awgConfig.test.js
```

Expected: FAIL in the new validation cases.

- [ ] **Step 6: Implement validation with exact cross-platform limits**

Add helpers that enforce:

```js
const assertRange = (name, value, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid AWG 2 parameter ${name}: expected ${min}..${max}`);
  }
};

const validateAwg2Parameters = (server) => {
  assertRange('JC', server.jc, 0, 128);
  assertRange('JMIN', server.jmin, 0, 1279);
  assertRange('JMAX', server.jmax, 0, 1279);
  if (server.jmin > server.jmax) {
    throw new Error('Invalid AWG 2 parameters: JMIN must not exceed JMAX');
  }
  ['s1', 's2', 's3'].forEach((field) => assertRange(field.toUpperCase(), server[field], 0, 64));
  assertRange('S4', server.s4, 0, 32);
  ['h1', 'h2', 'h3', 'h4'].forEach((field) => assertRange(field.toUpperCase(), server[field], 5, 2_147_483_647));
  const headers = [server.h1, server.h2, server.h3, server.h4];
  const duplicateIndex = headers.findIndex((value, index) => headers.indexOf(value) !== index);
  if (duplicateIndex !== -1) {
    throw new Error(`Invalid AWG 2 parameter H${duplicateIndex + 1}: header values must be unique`);
  }
  ['i1', 'i2', 'i3', 'i4', 'i5'].forEach((field) => {
    if (typeof server[field] !== 'string') {
      throw new Error(`Invalid AWG 2 parameter ${field.toUpperCase()}: expected a string`);
    }
  });
  return server;
};
```

- [ ] **Step 7: Add failing legacy migration tests**

Add a fixture containing server keys and a client with tags, expiration, quota, and one-time-link fields. Assert:

```js
const result = migrateConfigToAwg2(legacyConfig, {
  env: {},
  randomInt: sequentialRandom(),
});

expect(result.migrated).toBe(true);
expect(result.config.protocolVersion).toBe(2);
expect(result.config.server.privateKey).toBe(legacyConfig.server.privateKey);
expect(result.config.clients).toEqual(legacyConfig.clients);
expect(result.config.server.s3).toBeGreaterThan(0);
expect(legacyConfig.protocolVersion).toBeUndefined();
```

Also assert that a valid version-2 config returns `{ migrated: false }` unchanged and that any explicit unsupported version throws `Unsupported AmneziaWG protocol version: 3`.

- [ ] **Step 8: Implement immutable migration and idempotence**

Implement:

```js
const migrateConfigToAwg2 = (config, options = {}) => {
  if (config.protocolVersion === PROTOCOL_VERSION) {
    validateAwg2Parameters(config.server);
    return { config, migrated: false };
  }
  if (config.protocolVersion !== undefined) {
    throw new Error(`Unsupported AmneziaWG protocol version: ${config.protocolVersion}`);
  }
  if (!config.server || !config.clients || typeof config.clients !== 'object') {
    throw new Error('Invalid legacy WireGuard configuration: server and clients are required');
  }
  const parameters = createAwg2Parameters(options);
  return {
    migrated: true,
    config: {
      ...config,
      protocolVersion: PROTOCOL_VERSION,
      server: { ...config.server, ...parameters },
      clients: config.clients,
    },
  };
};
```

- [ ] **Step 9: Add failing rendering tests**

Assert exact line order, casing, and omission of empty signature packets:

```js
expect(renderAwg2InterfaceLines(server)).toBe([
  'Jc = 4', 'Jmin = 64', 'Jmax = 512',
  'S1 = 15', 'S2 = 16', 'S3 = 17', 'S4 = 8',
  'H1 = 101', 'H2 = 102', 'H3 = 103', 'H4 = 104',
].join('\n'));
```

Set `i1` and `i3` in a second case and assert only `I1` and `I3` are appended.

- [ ] **Step 10: Implement AWG 2 interface-line rendering**

Use an explicit field map rather than capitalization heuristics:

```js
const FIELD_NAMES = [
  ['jc', 'Jc'], ['jmin', 'Jmin'], ['jmax', 'Jmax'],
  ['s1', 'S1'], ['s2', 'S2'], ['s3', 'S3'], ['s4', 'S4'],
  ['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4'],
];

const renderAwg2InterfaceLines = (server) => {
  validateAwg2Parameters(server);
  const lines = FIELD_NAMES.map(([field, output]) => `${output} = ${server[field]}`);
  ['i1', 'i2', 'i3', 'i4', 'i5'].forEach((field, index) => {
    if (server[field] !== '') lines.push(`I${index + 1} = ${server[field]}`);
  });
  return lines.join('\n');
};

module.exports = {
  PROTOCOL_VERSION,
  createAwg2Parameters,
  validateAwg2Parameters,
  migrateConfigToAwg2,
  renderAwg2InterfaceLines,
};
```

- [ ] **Step 11: Run focused and complete tests**

Run:

```bash
npm --prefix src test -- tests/awgConfig.test.js
npm --prefix src test
npm --prefix src run lint
```

Expected: all tests pass and lint exits zero.

- [ ] **Step 12: Commit the pure model**

```bash
git add src/lib/awgConfig.js src/tests/awgConfig.test.js
git commit -m "feat: add AWG 2 configuration model"
```

---

### Task 2: Safe Configuration File Operations

**Files:**
- Create: `src/lib/configFiles.js`
- Create: `src/tests/configFiles.test.js`

**Interfaces:**
- Produces: `readJsonConfig(filePath) -> Promise<{ exists, raw, config }>`
- Produces: `createBackupOnce(filePath, raw) -> Promise<'created' | 'exists'>`
- Produces: `writeFileAtomic(filePath, contents, mode) -> Promise<void>`

- [ ] **Step 1: Write failing real-filesystem tests**

Use `fs.mkdtemp(path.join(os.tmpdir(), 'awg2-config-'))` in `beforeEach`, verify the resolved directory begins with `os.tmpdir()`, and remove only that directory in `afterEach`. Test:

```js
expect(await readJsonConfig(missingPath)).toEqual({
  exists: false,
  raw: null,
  config: null,
});
```

Also test valid JSON, malformed JSON with an error containing the path, propagation of non-ENOENT errors, exclusive backup behavior, file mode `0600`, atomic replacement, and removal of temporary files after a simulated rename failure.

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

```bash
npm --prefix src test -- tests/configFiles.test.js
```

Expected: FAIL because `../lib/configFiles` does not exist.

- [ ] **Step 3: Implement strict JSON reading**

Create `src/lib/configFiles.js`:

```js
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const readJsonConfig = async (filePath, fsApi = fs) => {
  let raw;
  try {
    raw = await fsApi.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { exists: false, raw: null, config: null };
    throw err;
  }
  try {
    return { exists: true, raw, config: JSON.parse(raw) };
  } catch (err) {
    throw new Error(`Cannot parse WireGuard configuration ${filePath}: ${err.message}`);
  }
};
```

- [ ] **Step 4: Implement exclusive backup creation**

```js
const createBackupOnce = async (filePath, raw, fsApi = fs) => {
  try {
    await fsApi.writeFile(filePath, raw, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return 'created';
  } catch (err) {
    if (err.code === 'EEXIST') return 'exists';
    throw new Error(`Cannot create legacy WireGuard backup ${filePath}: ${err.message}`);
  }
};
```

- [ ] **Step 5: Implement same-directory atomic writes and cleanup**

```js
const writeFileAtomic = async (filePath, contents, mode, fsApi = fs) => {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    await fsApi.writeFile(tempPath, contents, { encoding: 'utf8', mode, flag: 'wx' });
    await fsApi.rename(tempPath, filePath);
  } catch (err) {
    await fsApi.unlink(tempPath).catch(() => {});
    throw new Error(`Cannot atomically write ${filePath}: ${err.message}`);
  }
};
```

Export all three functions.

- [ ] **Step 6: Run focused, full, and lint verification**

```bash
npm --prefix src test -- tests/configFiles.test.js
npm --prefix src test
npm --prefix src run lint
```

Expected: all commands exit zero.

- [ ] **Step 7: Commit safe storage primitives**

```bash
git add src/lib/configFiles.js src/tests/configFiles.test.js
git commit -m "feat: add atomic WireGuard config storage"
```

---

### Task 3: WireGuard Startup Migration

**Files:**
- Modify: `src/lib/WireGuard.js:3-177`
- Modify: `src/config.js:52-64`
- Create: `src/tests/wireGuardAwg2.test.js`

**Interfaces:**
- Consumes: `migrateConfigToAwg2`, `validateAwg2Parameters`, and file helpers from Tasks 1-2.
- Produces: `WireGuard#getConfig()` that distinguishes fresh, legacy, valid-v2, and corrupt state.
- Produces: `/etc/wireguard/wg0.awg1.backup.json` before legacy replacement.

- [ ] **Step 1: Add dependency injection needed for deterministic startup tests**

Write a failing test that constructs:

```js
const wg = new WireGuard({
  wgPath: tempDirectory,
  env: {},
  exec: vi.fn(async (command) => command.includes('genkey') ? 'private' : 'public'),
  randomInt: sequentialRandom(),
});
```

Assert the constructor exists and stores no secrets in logs. The production defaults remain `WG_PATH`, `process.env`, `Util.exec`, and `crypto.randomInt`.

- [ ] **Step 2: Run the focused test and verify constructor behavior fails**

```bash
npm --prefix src test -- tests/wireGuardAwg2.test.js
```

Expected: FAIL because `WireGuard` ignores the injected options.

- [ ] **Step 3: Implement a backward-compatible constructor**

Add to `WireGuard`:

```js
constructor({
  wgPath = WG_PATH,
  env = process.env,
  exec = Util.exec,
  randomInt = crypto.randomInt,
} = {}) {
  this.wgPath = wgPath;
  this.env = env;
  this.exec = exec;
  this.randomInt = randomInt;
}
```

Replace file paths in startup/persistence with `this.wgPath`. Replace `Util.exec` calls in the class with `this.exec` so test behavior matches production behavior across all methods.

- [ ] **Step 4: Add failing fresh-install and corrupt-JSON tests**

Assert a missing `wg0.json` creates `protocolVersion: 2` and AWG 2 parameters. Assert malformed JSON rejects with `Cannot parse WireGuard configuration` and does not call `genkey`, `wg-quick`, or any persistence helper.

- [ ] **Step 5: Implement fresh AWG 2 creation without broad catch**

Refactor `__buildConfig` to:

```js
const loaded = await readJsonConfig(path.join(this.wgPath, 'wg0.json'));
if (!loaded.exists) {
  const privateKey = await this.exec('wg genkey');
  const publicKey = await this.exec(`echo ${privateKey} | wg pubkey`, {
    log: 'echo ***hidden*** | wg pubkey',
  });
  return {
    config: {
      protocolVersion: PROTOCOL_VERSION,
      server: {
        privateKey,
        publicKey,
        address: WG_DEFAULT_ADDRESS.replace('x', '1'),
        ...createAwg2Parameters({ env: this.env, randomInt: this.randomInt }),
      },
      clients: {},
    },
    migrated: false,
  };
}
```

Do not retain the existing catch-all behavior that treats all filesystem and JSON errors as an empty install.

- [ ] **Step 6: Add failing legacy preservation, backup, and idempotence tests**

Write a legacy JSON fixture to the temporary directory, call `getConfig()`, and assert:

- the original raw file content is stored in `wg0.awg1.backup.json`;
- backup mode is `0600` on Linux;
- all keys and client metadata are unchanged;
- `protocolVersion` and AWG 2 fields exist in the active JSON;
- a second `WireGuard` instance does not alter parameters or backup bytes;
- an unsupported version fails before invoking interface commands.

- [ ] **Step 7: Implement ordered migration and backup**

For an existing file:

```js
const migration = migrateConfigToAwg2(loaded.config, {
  env: this.env,
  randomInt: this.randomInt,
});
if (migration.migrated) {
  await createBackupOnce(
    path.join(this.wgPath, 'wg0.awg1.backup.json'),
    loaded.raw,
  );
}
return migration;
```

Set `this.__configPromise` to the migrated config only after migration validation and backup creation succeed.

- [ ] **Step 8: Add failing atomic-persistence orchestration tests**

Mock the file helper module and assert `__saveConfig` validates first, atomically writes JSON and server config, and only then allows `wg-quick up`/`wg syncconf`. Force each write to reject and assert no interface command follows it.

- [ ] **Step 9: Replace direct writes with validated atomic writes**

Change `__saveConfig` to validate `config.server`, construct both strings without logging secrets, then call:

```js
await writeFileAtomic(
  path.join(this.wgPath, 'wg0.json'),
  JSON.stringify(config, null, 2),
  0o600,
);
await writeFileAtomic(
  path.join(this.wgPath, 'wg0.conf'),
  serverConfiguration,
  0o600,
);
```

Keep `getConfig` ordering as persist, `wg-quick down`, `wg-quick up`, then sync. Preserve the existing helpful missing-kernel error.

- [ ] **Step 10: Remove module-load AWG randomness from `src/config.js`**

Delete `getRandomInt`, `getRandomJunkSize`, `getRandomHeader`, and exports `JC` through `H4`. AWG creation now happens only in `createAwg2Parameters`; unrelated exports remain unchanged.

- [ ] **Step 11: Run migration-focused and regression verification**

```bash
npm --prefix src test -- tests/wireGuardAwg2.test.js
npm --prefix src test
npm --prefix src run lint
```

Expected: all commands exit zero.

- [ ] **Step 12: Commit startup migration**

```bash
git add src/lib/WireGuard.js src/config.js src/tests/wireGuardAwg2.test.js
git commit -m "feat: migrate persisted tunnels to AWG 2"
```

---

### Task 4: Matching Server and Client AWG 2 Profiles

**Files:**
- Modify: `src/lib/WireGuard.js:126-177,262-288`
- Modify: `src/tests/wireGuardAwg2.test.js`

**Interfaces:**
- Consumes: `renderAwg2InterfaceLines(server) -> string`.
- Produces: server and client `[Interface]` blocks with identical framing parameters.

- [ ] **Step 1: Add failing server/client rendering tests**

Create a complete v2 server fixture and assert `wg0.conf` and `getClientConfiguration()` both contain the exact result of `renderAwg2InterfaceLines(server)`. Assert `I2 =` is absent when `i2` is empty and present when non-empty.

Also assert private keys appear only in their intended interface and that logging functions never receive either private key.

- [ ] **Step 2: Run the rendering test and verify missing fields**

```bash
npm --prefix src test -- tests/wireGuardAwg2.test.js
```

Expected: FAIL because `S3`, `S4`, and optional `I` fields are absent.

- [ ] **Step 3: Replace duplicated AWG interpolation with the shared renderer**

In both templates use:

```js
${renderAwg2InterfaceLines(config.server)}
```

Remove direct `Jc` through `H4` interpolation. Keep `PrivateKey`, `Address`, DNS, MTU, peer keys, allowed IPs, keepalive, and endpoint behavior unchanged.

- [ ] **Step 4: Add a test for profile stability**

Call `getClientConfiguration()` twice for the same persisted v2 config and assert byte-for-byte equality. This proves rendering does not generate parameters per download.

- [ ] **Step 5: Run focused, complete, and lint checks**

```bash
npm --prefix src test -- tests/wireGuardAwg2.test.js
npm --prefix src test
npm --prefix src run lint
```

Expected: all commands exit zero.

- [ ] **Step 6: Commit profile rendering**

```bash
git add src/lib/WireGuard.js src/tests/wireGuardAwg2.test.js
git commit -m "feat: render matching AWG 2 profiles"
```

---

### Task 5: Pinned AWG 2 Image and CI Smoke Gate

**Files:**
- Modify: `Dockerfile:1-51`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: a `linux/amd64` image containing `amneziawg-go`, `wg`, and `wg-quick` from version 2.0.0.
- Produces: deployment workflow that does not publish when unit, lint, build, or smoke checks fail.

- [ ] **Step 1: Change the base image and health check**

Use:

```dockerfile
FROM amneziavpn/amneziawg-go:2.0.0
HEALTHCHECK CMD /usr/bin/timeout 5s /bin/sh -c "/usr/bin/wg show wg0 >/dev/null 2>&1 || exit 1" --interval=1m --timeout=5s --retries=3
```

Keep the existing application copies, packages, iptables-legacy setup, and command. Do not add a second AWG binary from another source.

- [ ] **Step 2: Build the production image locally**

```bash
docker build --platform linux/amd64 --tag amnezia-wg-ui:awg2-test .
```

Expected: build succeeds and reports the pinned `2.0.0` base.

- [ ] **Step 3: Verify the image toolchain without starting the service**

```bash
docker run --rm --entrypoint sh amnezia-wg-ui:awg2-test -c "command -v amneziawg-go && command -v wg && command -v wg-quick"
```

Expected: all three absolute command paths are printed and exit status is zero.

- [ ] **Step 4: Add CI unit and lint gates before image publishing**

In `deploy.yml`, add Node setup and:

```yaml
    - uses: actions/setup-node@v4
      with:
        node-version: 18
        cache: npm
        cache-dependency-path: src/package-lock.json
    - run: npm ci --prefix src
    - run: npm --prefix src test
    - run: npm --prefix src run lint
```

- [ ] **Step 5: Make CI build and load the amd64 image for smoke testing**

Before registry login/publishing, add a `docker/build-push-action@v6` step with `platforms: linux/amd64`, `load: true`, `push: false`, and tag `amnezia-wg-ui:awg2-smoke`.

Run the same `command -v` assertion from Step 3 in CI.

- [ ] **Step 6: Add privileged interface smoke testing**

In CI, create a temporary directory, run the image with `--cap-add NET_ADMIN`, `--device /dev/net/tun`, `WG_HOST=127.0.0.1`, `WG_ALLOWED_IPS=0.0.0.0/0`, and a bind mount at `/etc/wireguard`. Poll for at most 30 seconds:

```bash
docker exec awg2-smoke wg show wg0
```

Always print container logs and remove the smoke container in a final workflow step. The assertion passes only when `wg0` exists.

- [ ] **Step 7: Restrict the publish build to amd64**

Change the existing publish step to:

```yaml
platforms: linux/amd64
```

Remove QEMU setup because no cross-architecture build remains. Keep Buildx for cached reproducible builds.

- [ ] **Step 8: Run local image smoke verification**

Start a disposable container using an explicit temporary directory under the current repository or OS temp directory, verify `wg show wg0`, then remove only the named `awg2-smoke` container and its temporary directory.

Expected: interface exists and the container remains healthy after the health-check start period.

- [ ] **Step 9: Commit image and workflow changes**

```bash
git add Dockerfile .github/workflows/deploy.yml
git commit -m "build: pin and smoke test AWG 2 image"
```

---

### Task 6: Operator Configuration, Migration, and Rollback Documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md:132-176`
- Modify: `docs/changelog.json`

**Interfaces:**
- Documents: exact AWG 2 environment names/ranges, profile-breaking migration, diagnostics, rollback, and platform acceptance.

- [ ] **Step 1: Update `.env.example` with optional AWG 2 overrides**

Add commented examples so defaults remain active:

```dotenv
# AWG 2 optional overrides (defaults are generated once and persisted)
# JC=4
# JMIN=64
# JMAX=512
# S1=32
# S2=40
# S3=24
# S4=16
# H1=1000000001
# H2=1000000002
# H3=1000000003
# H4=1000000004
# I1=
# I2=
# I3=
# I4=
# I5=
```

- [ ] **Step 2: Update the README option table**

Document every field with exact validation limits and state that overrides apply only when creating or migrating the persisted v2 configuration; changing env after `protocolVersion: 2` does not silently rewrite active framing parameters.

- [ ] **Step 3: Add a breaking migration warning and workflow**

Document:

1. Back up the Docker volume.
2. Deploy the AWG 2 image.
3. Confirm `wg0.awg1.backup.json` exists.
4. Download every client `.conf` again.
5. Import the new file into a current AWG 2-capable client.

State that old profiles cannot be expected to connect after migration.

- [ ] **Step 4: Add diagnostics and acceptance commands**

Include:

```bash
sudo tcpdump -ni any 'udp port 51820'
docker exec amnezia-wg-easy wg show wg0
docker exec amnezia-wg-easy wg show wg0 latest-handshakes
```

Explain the three outcomes: no UDP, UDP without handshake, and handshake without bidirectional traffic.

- [ ] **Step 5: Add exact rollback steps**

Document stopping the container, restoring the previous image, copying `wg0.awg1.backup.json` over `wg0.json`, and starting the previous container. Warn operators to keep the backup until all five platforms pass.

- [ ] **Step 6: Add the manual platform matrix**

For Windows, Android, Linux, macOS, and iOS, require:

- latest available official AWG 2-capable client;
- freshly downloaded `.conf` import;
- non-zero fresh handshake timestamp;
- increasing RX and TX counters;
- IPv4 web and DNS success.

State that AmneziaVPN must be at least 4.8.12.9 and that native clients must support non-zero `S3`/`S4`.

- [ ] **Step 7: Add a changelog entry**

Add the next numeric release entry describing the AWG 2 backend, breaking profile refresh, migration backup, and amd64-only publishing. Keep the JSON valid.

- [ ] **Step 8: Verify documentation references and JSON**

```bash
node -e "JSON.parse(require('node:fs').readFileSync('docs/changelog.json', 'utf8'))"
rg -n "AWG 2|S3|S4|wg0.awg1.backup.json|latest-handshakes|linux/amd64" README.md .env.example docs/changelog.json
git diff --check
```

Expected: JSON parse succeeds, every required topic has a match, and diff check is clean.

- [ ] **Step 9: Commit operator documentation**

```bash
git add .env.example README.md docs/changelog.json
git commit -m "docs: document AWG 2 migration"
```

---

### Task 7: Final Automated Verification and Release Handoff

**Files:**
- Modify only files required to correct failures found by the commands below.

**Interfaces:**
- Produces: evidence that the repository test suite, lint, production image, migration smoke test, and worktree scope are clean before manual platform testing.

- [ ] **Step 1: Run the complete Node verification**

```bash
npm --prefix src ci
npm --prefix src test
npm --prefix src run lint
```

Expected: install exits zero, all Vitest tests pass, and ESLint exits zero.

- [ ] **Step 2: Rebuild the exact production image without cache**

```bash
docker build --no-cache --platform linux/amd64 --tag amnezia-wg-ui:awg2-release-candidate .
```

Expected: build exits zero using `amneziavpn/amneziawg-go:2.0.0`.

- [ ] **Step 3: Run fresh-install smoke verification**

Start a named disposable container with a new temporary configuration directory, wait for `wg show wg0`, assert the resulting JSON has `protocolVersion: 2`, and assert the server config contains `S3` and `S4`. Remove only that container and temporary directory after recording results.

- [ ] **Step 4: Run legacy-migration smoke verification**

Create a non-secret legacy fixture in a new temporary directory, start the same release-candidate image, and assert:

- `wg0.awg1.backup.json` equals the original fixture bytes;
- active JSON reports protocol version 2;
- retained peer keys and metadata are unchanged;
- `wg show wg0` succeeds.

Remove only the named disposable container and verified temporary directory.

- [ ] **Step 5: Review the final diff and commit scope**

```bash
git status --short
git diff --check
git log --oneline -8
```

Expected: implementation commits contain only planned files, and any unrelated
user changes discovered at execution time remain uncommitted and untouched.

- [ ] **Step 6: Prepare manual platform handoff**

Report the image tag/digest, backup path, client version floor, profile refresh requirement, and a five-row checklist for Windows, Android, Linux, macOS, and iOS. Do not claim cross-platform completion until the user supplies handshake and bidirectional-traffic results for all five platforms.
