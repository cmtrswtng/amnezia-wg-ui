# AmneziaWG 2 Migration Design

## Goal

Upgrade the server and generated client profiles from the legacy AmneziaWG
implementation to AmneziaWG 2. The migration prioritizes reliable operation on
Windows, Android, Linux, macOS, and iOS while enabling AWG 2 traffic padding and
obfuscation.

Backward compatibility with already downloaded profiles is not required. Existing
client records and cryptographic keys must nevertheless survive the migration so
an administrator only needs to download and redistribute each profile again.

The target server architecture is `linux/amd64`. ARM image publishing is outside
the scope of this change.

## Current Constraints

- The current image inherits from the floating and obsolete
  `amneziavpn/amnezia-wg:latest` image.
- Server and client configurations contain only `Jc`, `Jmin`, `Jmax`, `S1`, `S2`,
  and `H1` through `H4`.
- The persisted configuration has no protocol or schema version.
- AWG parameters are interface-wide. Changing them invalidates every previously
  downloaded profile.
- Some released clients have had interoperability problems with header ranges,
  tagged `I1` expressions, and non-zero `S3`/`S4`. The implementation therefore
  needs conservative defaults and an explicit cross-platform verification matrix.

## Selected Approach

Use the versioned `amneziavpn/amneziawg-go:2.0.0` base image instead of a floating
tag. Preserve the existing Node application and management API, extend its
persisted configuration schema and generated AWG files, and migrate the existing
JSON configuration once during startup.

The UI and client-management API remain unchanged. AWG 3, dual legacy/AWG 2
interfaces, ARM builds, and automatic client-profile delivery are explicitly out
of scope.

## Image and Runtime

- Replace `amneziavpn/amnezia-wg:latest` with
  `amneziavpn/amneziawg-go:2.0.0`.
- Keep using the image-provided `amneziawg-go`, `wg`, and `wg-quick` compatibility
  commands so the application's command flow does not change unnecessarily.
- Limit the publish workflow to `linux/amd64` until ARM support is deliberately
  restored and tested.
- Add an image smoke check that proves the AWG binary and tools exist and can parse
  the generated configuration. A healthy Node process alone is not sufficient.

## Configuration Schema

The persisted server object gains:

```json
{
  "protocolVersion": 2,
  "server": {
    "s3": 0,
    "s4": 0,
    "i1": "",
    "i2": "",
    "i3": "",
    "i4": "",
    "i5": ""
  }
}
```

The example above shows shape only. Generated `S3` and `S4` defaults are non-zero
as specified below. `protocolVersion` is top-level so startup can select and
validate the schema before constructing an interface configuration.

### Default cross-platform preset

- `Jc`: random integer from 4 through 8 inclusive.
- `Jmin`: 64.
- `Jmax`: 512, staying comfortably below a 1280-byte path MTU.
- `S1`, `S2`, `S3`: independently generated integers from 15 through 64 inclusive.
- `S4`: random integer from 8 through 32 inclusive.
- `H1` through `H4`: unique single integers from 5 through 2,147,483,647
  inclusive. Ranges are not generated because released Windows clients have had
  interoperability problems with them.
- `I1` through `I5`: empty by default. The fields and environment overrides are
  supported, but tagged signature expressions are opt-in because released iOS and
  Windows clients have parsed some expressions differently.

Non-zero `S3` and `S4`, randomized message padding, magic headers, and junk packets
provide the default AWG 2 obfuscation. Deployments may opt into signature packets
after testing their exact client fleet.

Existing environment variables remain valid. New optional variables are `S3`,
`S4`, `I1`, `I2`, `I3`, `I4`, and `I5`.

## Validation

All environment overrides and migrated/generated parameters are validated before
any persistent file is replaced:

- integer fields must be base-10 integers rather than partially parsed strings;
- `Jc` must be between 0 and 128;
- `0 <= Jmin <= Jmax < 1280`;
- `S1`, `S2`, and `S3` must be between 0 and 64;
- `S4` must be between 0 and 32;
- `H1` through `H4` must be between 5 and 2,147,483,647 and pairwise unique. The
  narrower signed range is intentional for cross-platform client compatibility;
- `I1` through `I5` must be strings and may be empty.

Validation failure aborts startup with a message naming the invalid field. It must
not modify `wg0.json`, its backup, or `wg0.conf`.

## Migration Flow

1. Read and parse `wg0.json`. A missing file creates a fresh AWG 2 configuration
   without a legacy backup; malformed JSON is a startup error and is never treated
   as a fresh installation.
2. If `protocolVersion` is `2`, validate it and continue without regenerating any
   AWG parameters.
3. If the version is absent, treat the file as the legacy schema.
4. Validate the legacy data required to retain the server and clients.
5. Create `/etc/wireguard/wg0.awg1.backup.json` with mode `0600` using exclusive
   creation. An existing backup is never overwritten.
6. Preserve the server private/public keys, all client keys, addresses, names,
   enablement, expiration, tags, quotas, and one-time-link state.
7. Replace the legacy AWG interface parameters with one newly generated AWG 2
   preset and set `protocolVersion` to `2`.
8. Write JSON and generated configuration through temporary files followed by
   atomic rename.
9. Bring up or synchronize `wg0` only after both persistent files are valid.

No client or server keys are regenerated. Previously downloaded profiles stop
working because their interface-wide AWG parameters differ; freshly downloaded
profiles use the retained client keys plus the new AWG 2 parameters.

If backup creation, validation, or atomic persistence fails, startup stops before
the interface is changed.

## Generated Configurations

Both server and client `[Interface]` sections include `Jc`, `Jmin`, `Jmax`,
`S1` through `S4`, and `H1` through `H4`.

`I1` through `I5` are emitted only when non-empty. This avoids empty-value parser
bugs and keeps the default profile accepted by clients that support AWG 2 core
fields but have incomplete signature-tag support.

Server-side and client-side values that affect packet framing must come from the
same persisted server object. No AWG value is regenerated while rendering an
individual profile.

## Error Handling and Rollback

Startup errors must distinguish JSON parsing, legacy migration validation, AWG
parameter validation, backup creation, persistence, and interface activation.
Secret keys and full configuration contents must not be written to logs.

Rollback procedure:

1. Stop the AWG 2 container.
2. Deploy the previous application image.
3. Replace `wg0.json` with `wg0.awg1.backup.json`.
4. Start the previous container.

The backup contains the legacy keys and parameters, so previously downloaded
profiles become usable again after rollback.

## Testing

### Automated tests

- Migrate a representative legacy JSON fixture and prove every server/client key
  and management field is preserved.
- Prove migration creates exactly one backup and never overwrites it.
- Prove repeated startup leaves all AWG 2 values unchanged.
- Test every validation boundary and malformed environment value.
- Prove invalid input leaves the original JSON and generated configuration intact.
- Prove `H1` through `H4` are unique.
- Snapshot or structurally compare generated server and client configurations,
  including conditional omission of empty `I1` through `I5`.
- Prove framing parameters match between server and client output.
- Run the existing complete test suite.

### Container smoke test

- Build the production image for `linux/amd64`.
- Check the versions and availability of `amneziawg-go`, `wg`, and `wg-quick`.
- Start a disposable container with a temporary configuration volume.
- Confirm `wg0` is created and the generated AWG 2 configuration is accepted.

### Manual platform matrix

Use the latest available official AWG 2-capable application on each platform.
AmneziaVPN must be at least 4.8.12.9; native AmneziaWG applications must explicitly
support `S3` and `S4`.

For Windows, Android, Linux, macOS, and iOS:

1. Download a newly generated `.conf` file rather than reusing a legacy profile.
2. Import and connect.
3. Confirm a fresh server-side handshake timestamp.
4. Confirm receive and transmit counters both increase.
5. Confirm IPv4 web access and DNS resolution through the tunnel.

Connection UI state by itself is not acceptance evidence. Release acceptance
requires successful handshake and bidirectional traffic on all five platforms.

## Documentation Changes

Update the README and environment-variable table with:

- the AWG 2 backend and supported server architecture;
- the breaking profile migration warning;
- the new environment variables and validation ranges;
- required client capabilities;
- migration and rollback steps;
- `tcpdump` and `wg show` diagnostic commands;
- the manual platform verification matrix.
