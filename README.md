<div align="center">

# AmneziaWG UI

**AmneziaWG 3.1 and a React admin for managing VPN access.**

[![image](https://img.shields.io/badge/ghcr.io-cmtrswtng%2Famnezia--wg--ui-blue)](https://github.com/cmtrswtng/amnezia-wg-ui/pkgs/container/amnezia-wg-ui)
[![license](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-orange)](./LICENSE)

<img src="./assets/screenshot.png" width="1100" alt="React admin with client cards, connection activity, search and filters" />

</div>

## Features

- AmneziaWG Go **3.1.20260828**, bundled AWG tools, and Node 24; `linux/amd64`.
- React **19.3.1** admin with cloud-white surfaces, sky-blue details and a muted
  rose accent. System fonts, local React Bits SpotlightCard/CountUp/AnimatedContent
  adaptations, keyboard dialogs and reduced-motion support.
- Search by name, IP or tag; combined access/connection/tag filters; sorting by
  name, handshake, traffic or expiry; card and compact-list views.
- A recent handshake is shown separately from permission to connect. “Online”
  means a handshake within 3 minutes, not a guarantee of current reachability.
- Clients, QR codes, config downloads, optional one-time links, tags and expiry.
- Traffic quotas, renewal, quota reset, bulk actions, overview and audit log.
- SQLite stores client records, settings and cumulative traffic in the existing
  data volume. Counters survive server restarts and container replacement.
- Backup/restore, preserved translations, optional avatars, traffic charts,
  live rates, and Prometheus metrics.

## New installation

Requires a Linux Docker host with `/dev/net/tun` and Docker Compose. The published
image targets AMD64; ARM publishing is not part of this release.

```bash
git clone https://github.com/cmtrswtng/amnezia-wg-ui.git
cd amnezia-wg-ui
cp .env.example .env
# Set WG_HOST to your public IP or hostname.
npm --prefix src ci
node src/setup-password.mjs
docker compose up --build -d
```

Open `http://YOUR_SERVER:51821` (or your configured `PORT`). Open `WG_PORT/udp`
in the host/cloud firewall. The repository Compose file builds this checkout;
it no longer points at the upstream fork's image.

The Linux installer is also available:

```bash
curl -fsSL https://raw.githubusercontent.com/cmtrswtng/amnezia-wg-ui/master/install.sh -o install-awg.sh
sudo bash install-awg.sh
```

The installer writes `/opt/amnezia-wg-ui/.env`, Compose settings and an admin
password hash; VPN data is retained in its Docker volume. Never use
`docker compose down -v` when you want to preserve clients and keys.

### Running an additional instance

The installer supports independent instances, for example to keep AWG 2 running
while users move to AWG 3.1. Download the installer as above, then run:

```bash
sudo bash install-awg.sh --instance awg31 --image ghcr.io/cmtrswtng/amnezia-wg-ui:18
```

`--instance awg31` uses `/opt/amnezia-wg-ui-awg31`, container
`amnezia-wg-ui-awg31`, Compose project `amnezia-wg-ui-awg31` and its own
`amnezia-wg-ui-awg31_awg_data` volume. It defaults to admin port `51823/tcp`,
VPN port `51822/udp` and address template `10.9.0.x`. Choose unused ports at the
prompts and allow them in the server/provider firewall. Existing instances retain
their containers, ports, volumes and client configurations. Do not restore the
old data into a volume shared by both versions.

Without `--instance`, the installer manages the original `/opt/amnezia-wg-ui`
installation. For an additional instance, keep `--instance awg31` on every
installer command. Updating that instance retains its saved image tag, password
and ports; use `--image` explicitly to select another image:

```bash
sudo bash install-awg.sh --instance awg31
cd /opt/amnezia-wg-ui-awg31
sudo docker compose ps
sudo docker compose logs --tail=100
```

Before future updates of the old installation, preserve its current image with a
local tag or digest and pin that image in its Compose file. Its `latest` tag now
points to AWG 3.1. An already-running old container continues using its original
image until it is recreated. For migration without an interruption, leave the old
container running while issuing new 3.1 profiles from the additional instance.

`--reconfigure` explicitly replaces the selected instance's settings after making
backup copies; ordinary updates never rewrite passwords or ports. Declining an
update exits. Unknown arguments and occupied ports stop the installer. Run
`bash install-awg.sh --help` for options. Downloading to a file before using sudo
avoids the `/dev/fd/63` error from `sudo bash <(curl ...)`.

## Upgrading an existing server to 3.1

This is a breaking profile update. Existing client identities are retained, but
**every device must import a newly downloaded profile** after migration.
Use AmneziaVPN **5.0.1.5 or newer**, or a native AmneziaWG application that
explicitly supports 3.1. Plain WireGuard and older AWG clients cannot parse all
new fields. See the [official upgrade guidance](https://amnezia.org/ru/blog/amneziawg-3-1-is-here).

1. Save the current image and configuration before changing anything. Set the
   actual container name: the installer uses `amnezia-wg-ui`, the repository
   Compose file uses `amnezia-wg-easy`.

   ```bash
   CONTAINER=amnezia-wg-ui
   docker image tag "$(docker inspect --format '{{.Image}}' "$CONTAINER")" local/amnezia-wg-ui:before-awg31
   docker cp "$CONTAINER:/etc/wireguard/wg0.json" ./wg0.before-awg31.json
   cp .env .env.before-awg31
   chmod 600 wg0.before-awg31.json .env.before-awg31
   ```

2. Update these four settings **once on the server**, replacing old entries in
   `.env` rather than adding duplicate keys:

   ```dotenv
   WG_ALLOWED_IPS=0.0.0.0/0
   WG_DEFAULT_DNS=77.88.8.8, 77.88.8.1
   WG_MTU=1280
   WG_PERSISTENT_KEEPALIVE=20-25
   ```

   Explicit settings take precedence over defaults. In particular, an existing
   `WG_ALLOWED_IPS=0.0.0.0/0, ::/0` or old DNS value will not be silently
   overridden. Remove obsolete AWG 2 parameter overrides unless deliberately
   choosing a complete 3.1 preset. With random trailers enabled, `S1`–`S4` must
   be equal and at least 12; do not copy the old unequal padding example.

3. Deploy the new image, or build the updated checkout with
   `docker compose up --build -d`. For installer/image deployments, wait until
   the new release is published, then `docker compose pull` and
   `docker compose up -d --force-recreate`. Review container logs and health.
4. Download fresh profiles or scan fresh QR codes. Downloads, QR codes and
   one-time links share the same profile generator; no per-file edits are needed.
5. On Windows, Android, Linux, macOS and iOS, verify a fresh handshake, increasing
   RX/TX, IPv4 web access, DNS and large transfers. Check both Wi-Fi and cellular
   networks where available. An enabled toggle alone is not evidence of a tunnel.

### Migration and rollback

Startup migrates unversioned legacy state or `protocolVersion: 2` to
`protocolVersion: "3.1"`. It preserves server/client identity keys, names,
addresses, tags, quotas, expiry and links. Obfuscation parameters change once.
Header protection, padding, timings and signatures then remain stable across
restarts. Env changes do not rotate an existing persisted header key.

Before migration the original JSON is saved exclusively as
`/etc/wireguard/wg0.awg1.backup.json` or `wg0.awg2.backup.json`. Existing backups
are never overwritten. Invalid state, unknown versions, or a conflicting backup
stop migration. Restore also validates/migrates uploaded state and saves a
`wg0.pre-restore.<uuid>.json` snapshot before replacement.

To roll back, stop the container, restore `wg0.before-awg31.json` to
`/etc/wireguard/wg0.json` in its existing volume, and set the Compose image to
`local/amnezia-wg-ui:before-awg31` before recreating it. A stopped container can
be used as the copy destination:

```bash
docker stop "$CONTAINER"
docker cp ./wg0.before-awg31.json "$CONTAINER:/etc/wireguard/wg0.json"
# Set the existing Compose service's image to local/amnezia-wg-ui:before-awg31.
docker compose up -d --force-recreate
```

Keep both old/new backups. Old profiles match the old image/settings; 3.1
profiles match the migrated settings. Restoring only an old image is insufficient.

## Persistent clients and traffic

`/etc/wireguard/state.sqlite` is the source of truth for server settings, client
records and traffic totals. It uses transactions and SQLite WAL in the existing
Docker data volume; no Redis or separate database service is needed. Preserve
that volume when recreating the container.

On the first start, existing `wg0.json` data is imported automatically and copied
to `wg0.pre-sqlite.backup.json`. Keys, names, addresses, tags, quotas and expiry
are retained. Later starts read SQLite. `wg0.json` is a compatibility snapshot
refreshed on configuration saves; editing it does not change an initialized
database. Use the admin's backup/restore actions to export or replace state.
The exported JSON includes accumulated traffic, and restore makes a backup of
the current state before replacement.

Starting with release 18, restore restarts only this instance's tunnel to apply
the saved interface address, routes and NAT. NAT and newly allocated client
addresses follow the persisted server subnet, even if `WG_DEFAULT_ADDRESS` in
the deployment environment still contains the original installation default.
Explicit lifecycle hook overrides remain in effect. If the restored tunnel
cannot start, restore attempts to bring back the previous configuration. On
release 17, restoring a different subnet requires recreating that instance's
container after import.

Admin sessions use a different cookie name for each web port so simultaneous
panels on one hostname do not overwrite each other's sessions. After upgrading
to release 18, sign in again; existing VPN profiles are unaffected by this fix.

Traffic is sampled every five seconds even when no browser is open, and before
peer changes and graceful shutdown. Interface identities and stored cursors
prevent double counting after restart. Legacy quota cursors are converted while
retaining existing quota usage. A sudden power loss can lose traffic since the
last successful sample; counters already lost before this update cannot be
reconstructed. For backups, use the admin export instead of copying a live
SQLite file without its WAL.

This storage/UI update does not change VPN profiles. The profile re-import
above applies when upgrading the protocol from AWG 1/2 to AWG 3.1. An old image
reads JSON; when returning to this version, SQLite remains authoritative. Restore
the intended JSON through this version's admin if its database needs replacing.

## Networking defaults and limits

The server currently provisions IPv4 addresses, forwarding and NAT. The default
export therefore routes only `0.0.0.0/0`, uses Yandex basic DNS
`77.88.8.8, 77.88.8.1`, and sets MTU `1280`. The generator checks CIDR/IP syntax,
MTU including AWG overhead, and keepalive ranges before exporting.

**Native IPv6 is not tunneled by this IPv4 profile.** Removing `::/0` is not an
IPv6 kill switch. Full IPv6 server routing is outside this release. Network
blocking and outdated client applications can still prevent a handshake; changing
DNS cannot repair an absent handshake. `I1` signatures remain network-specific
and optional, as described in the [official parameters](https://docs.amnezia.org/documentation/amnezia-wg/).

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `WG_HOST` | required | Public IP/hostname in exported endpoints |
| `WG_PORT` | `51820` | VPN UDP listen/public port |
| `WG_CONFIG_PORT` | `WG_PORT` | Exported endpoint port override |
| `PORT`, `WEBUI_HOST` | `51821`, `0.0.0.0` | Admin listen port/address |
| `PASSWORD_HASH` | unset | Bcrypt admin hash; use the setup helper |
| `WG_DEFAULT_ADDRESS` | `10.8.0.x` | Initial IPv4 tunnel subnet; persisted subnet takes precedence |
| `WG_ALLOWED_IPS` | `0.0.0.0/0` | Exported routes; custom split routes allowed |
| `WG_DEFAULT_DNS` | `77.88.8.8, 77.88.8.1` | DNS IPs; explicit blank omits DNS |
| `WG_MTU` | `1280` | Tunnel MTU, validated with padding overhead |
| `WG_PERSISTENT_KEEPALIVE` | `20-25` | NAT keepalive interval/range in seconds |
| `WG_DEVICE` | `eth0` | IPv4 NAT egress interface |
| `LANG` | `en` | Initial language; saved user preference is retained |
| `MAX_AGE` | `0` | Remember-me duration in minutes |
| `UI_TRAFFIC_STATS` | `false` | Live rates in client cards |
| `UI_CHART_TYPE` | `0` | `0` off, `1` line, `2` area, `3` bar |
| `UI_ENABLE_SORT_CLIENTS` | `false` | Legacy setting accepted; new toolbar always offers sorting |
| `WG_ENABLE_ONE_TIME_LINKS` | `false` | Single-use profile links |
| `DICEBEAR_TYPE`, `USE_GRAVATAR` | unset | Optional external avatars |
| `ENABLE_PROMETHEUS_METRICS` | `false` | `/metrics` endpoint |
| `PROMETHEUS_METRICS_PASSWORD` | unset | Optional metrics password |

`WG_PRE_UP`, `WG_POST_UP`, `WG_PRE_DOWN`, `WG_POST_DOWN` remain available.
AWG 3.1 parameter names and examples are in [.env.example](.env.example).
The default preset uses a generated header key, equal 16–32 byte prefixes,
compatibility headers 1–4, content padding 16–64, randomized timings, random
trailers, and cookie protection. Custom larger paddings are constrained to stay
within the export MTU budget.

## Development and verification

Use Node 24 LTS. Backend and frontend dependencies are separate.

```bash
npm --prefix src ci
npm --prefix src/www ci
npm --prefix src test
npm --prefix src run lint
npm --prefix src/www test
npm --prefix src/www run build
npx --prefix src/www playwright install chromium
npm --prefix src/www run test:e2e
```

Browser tests serve the production build on loopback port 4180 and use synthetic
API fixtures. They cover desktop/mobile navigation, search, forms, login/logout,
dialog focus and overflow at 360px. They do not contact a production VPN.
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to reuse an installed Chromium if needed.

For container-level verification:

```bash
docker build -t amnezia-wg-ui:awg31-review .
bash scripts/smoke-awg31.sh amnezia-wg-ui:awg31-review
```

The smoke script creates an isolated Docker network and disposable containers
with no published ports or production volume. It checks fresh and v2-migrated
state, a live cross-subnet restore on a nondefault VPN port, real AWG parsing,
a handshake, bidirectional large packets and Yandex DNS through the encrypted
tunnel. It then verifies clients and nonzero traffic
after container restart and replacement with the same disposable volume, and
removes its containers, network and volumes. It requires
outbound DNS access. CI runs it before publishing an image.

The Docker host needs the legacy netfilter filter/NAT modules used by this
image. CI loads `iptable_filter` and `iptable_nat` on the host before its tunnel
test; the container does not mount the host's `/lib/modules`.

For hot reload: `npm run serve:dev`. The React UI is on port 5173 and proxies to
the configured backend. On restricted Windows environments, set `TEMP`/`TMP` to
an ignored directory inside `src/node_modules` when testing atomic file writes.

## Credits and licenses

Fork of [w0rng/amnezia-wg-easy](https://github.com/w0rng/amnezia-wg-easy), based on
[wg-easy](https://github.com/wg-easy/wg-easy) and the AmneziaWG integration by
[spcfox](https://github.com/spcfox/amnezia-wg-easy).
The repository retains its [CC BY-NC-SA 4.0 license](LICENSE).
UI third-party notices, including the React Bits license, are in
[src/www/THIRD_PARTY_NOTICES.md](src/www/THIRD_PARTY_NOTICES.md).
