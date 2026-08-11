<div align="center">

# AmneziaWG UI

**The easiest way to run AmneziaWG VPN — with an admin panel built for managing and selling access.**

[![fork of w0rng/amnezia-wg-easy](https://img.shields.io/badge/fork%20of-w0rng%2Famnezia--wg--easy-lightgrey)](https://github.com/w0rng/amnezia-wg-easy)
[![build](https://img.shields.io/github/actions/workflow/status/cmtrswtng/amnezia-wg-ui/deploy.yml?branch=master)](https://github.com/cmtrswtng/amnezia-wg-ui/actions)
[![image](https://img.shields.io/badge/ghcr.io-cmtrswtng%2Famnezia--wg--ui-blue)](https://github.com/cmtrswtng/amnezia-wg-ui/pkgs/container/amnezia-wg-ui)
[![license](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-orange)](./LICENSE)

<img src="./assets/screenshot.png" width="802" />

</div>

## ✨ Features

* 🚀 **All-in-one**: AmneziaWG + Web UI in a single container.
* 🖥️ **Modern dark admin UI** (Vue 3) — fast, clean, mobile-friendly.
* 👥 **Clients**: list, create, edit, delete, enable & disable, QR codes, downloadable configs.
* 🏷️ **Tags** — free-form labels with filtering and autocomplete. Know where each client came from.
* ⏳ **Expiry dates** — configs auto-disable when the time runs out; renew in one click.
* 📊 **Traffic quotas** — «N GB per M days» per client, auto-disable on exceed, new cycle on renewal.
* ✅ **Bulk actions** — extend, tag, enable/disable, reset quota, delete — for many clients at once.
* 📈 **Sales dashboard** — expiring soon, new clients this month, top by traffic.
* 🧾 **Audit log** — who created/changed/disabled what, including automatic cron events.
* 🌍 **20 languages** out of the box.
* 🔗 **One-time links** (optional), **Prometheus metrics**, Tx/Rx charts, Gravatar/DiceBear avatars.

## Requirements

* A host with Docker installed.

## Installation

### One-line installer (recommended)

Run on your Linux as root:

```bash
bash <(curl -Ls https://raw.githubusercontent.com/cmtrswtng/amnezia-wg-ui/master/install.sh)
```

The script will:

1. Install Docker (via the official `get.docker.com` script) if it's missing.
2. Auto-detect the server's public IP and ask you to confirm or edit it, then ask for the Web UI and WireGuard ports (defaults `51821` / `51820`).
3. Ask for the admin password twice (hidden input) and generate its bcrypt hash using the Docker image itself — no Node.js needed on the host.
4. Write `/opt/amnezia-wg-ui/.env` (mode `600`) and `/opt/amnezia-wg-ui/docker-compose.yml`.
5. Open `51820/udp` and `51821/tcp` in `ufw` if it's active (otherwise it reminds you to open them in your cloud firewall).
6. Start the container and **verify** that the password actually matches the hash seen by the running container.

When done it prints the Web UI URL (`http://<your-ip>:51821`).

**Updating:** just re-run the same one-liner — it detects the existing installation and offers to pull the latest image. To go through the full setup again (new password, ports, etc.), wipe `/opt/amnezia-wg-ui` first or edit the files there manually and run `docker compose up -d --force-recreate`.

**Files and data:** everything lives in `/opt/amnezia-wg-ui`; clients, keys and the audit log are stored in the `awg_data` Docker volume — `docker compose down` keeps them, `down -v` deletes them.

### 1. Install Docker (manual way)

```bash
curl -sSL https://get.docker.com | sh
sudo usermod -aG docker $(whoami)
exit
```

And log in again.

### 2. Run AmneziaWG UI

```bash
docker run -d \
  --name=amnezia-wg-ui \
  -e LANG=en \
  -e WG_HOST=<🚨YOUR_SERVER_IP> \
  -e PASSWORD_HASH=<🚨YOUR_ADMIN_PASSWORD_HASH> \
  -e PORT=51821 \
  -e WG_PORT=51820 \
  -v ~/.amnezia-wg-ui:/etc/wireguard \
  -p 51820:51820/udp \
  -p 51821:51821/tcp \
  --cap-add=NET_ADMIN \
  --cap-add=SYS_MODULE \
  --sysctl="net.ipv4.conf.all.src_valid_mark=1" \
  --sysctl="net.ipv4.ip_forward=1" \
  --device=/dev/net/tun:/dev/net/tun \
  --restart unless-stopped \
  ghcr.io/cmtrswtng/amnezia-wg-ui
```

> 💡 Replace `YOUR_SERVER_IP` with your WAN IP, or a Dynamic DNS hostname.
>
> 💡 Replace `YOUR_ADMIN_PASSWORD_HASH` with a bcrypt password hash to log in on the Web UI.
> The fastest way to get one — clone this repo and run:
>
> ```bash
> npm --prefix src ci && node src/setup-password.mjs
> ```
>
> It generates a random admin password, writes `PASSWORD_HASH` into your `.env` and prints the password once.
> The classic interactive way also works: `docker run --rm -it ghcr.io/cmtrswtng/amnezia-wg-ui wgpw` —
> see [How_to_generate_an_bcrypt_hash.md](./How_to_generate_an_bcrypt_hash.md).

The Web UI will now be available on `http://0.0.0.0:51821`.

The Prometheus metrics will now be available on `http://0.0.0.0:51821/metrics`. Grafana dashboard [21733](https://grafana.com/grafana/dashboards/21733-wireguard/)

> 💡 Your configuration files will be saved in `~/.amnezia-wg-ui`

### Docker Compose

```bash
git clone https://github.com/cmtrswtng/amnezia-wg-ui.git
cd amnezia-wg-ui
cp .env.example .env  # or create .env manually; at minimum set WG_HOST
node src/setup-password.mjs   # optional but recommended: sets the admin password
docker compose up --build -d
```

## Development

For local development with hot reload, run:

```bash
npm run serve:dev
```

This starts the backend with nodemon (auto-restarts on code changes) and the admin UI
via the Vite dev server on `http://localhost:5173` (hot reload, API proxied to the backend).
The backend API itself is available on `$PORT` (default `51821`).

## Options

These options can be configured by setting environment variables using `-e KEY="VALUE"` in the `docker run` command.

### AmneziaWG 2 configuration

The server uses the pinned `amneziavpn/amneziawg-go:2.0.0` backend and publishes a
`linux/amd64` image. The AWG parameters are interface-wide and are persisted in
`wg0.json` with top-level `protocolVersion: 2`. On a fresh install or one-time
legacy migration, the values below are generated (or taken from the environment)
and validated before they are persisted. Once `protocolVersion: 2` exists,
changing the environment does not silently rewrite the active framing values;
edit the persisted configuration only as part of a planned migration.

The generated defaults use independently randomized `S1`, `S2`, and `S3`
values, plus non-zero `S3` and `S4`; `I1` through `I5` are empty unless
explicitly configured. All newly generated client profiles must be
downloaded after migration because old profiles contain the previous
interface-wide framing parameters and cannot be expected to connect.

| Env                           | Default           | Example                        | Description                                                                                                                                                                                                        |
|-------------------------------|-------------------|--------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `PORT`                        | `51821`           | `6789`                         | TCP port for Web UI.                                                                                                                                                                                               |
| `WEBUI_HOST`                  | `0.0.0.0`         | `localhost`                    | IP address web UI binds to.                                                                                                                                                                                        |
| `PASSWORD_HASH`               | -                 | `$2y$05$Ci...`                 | When set, requires a password when logging in to the Web UI. Generate one with `node src/setup-password.mjs`.                                                                                                       |
| `WG_HOST`                     | -                 | `vpn.myserver.com`             | The public hostname of your VPN server.                                                                                                                                                                            |
| `WG_DEVICE`                   | `eth0`            | `ens6f0`                       | Ethernet device the wireguard traffic should be forwarded through.                                                                                                                                                 |
| `WG_PORT`                     | `51820`           | `12345`                        | The public UDP port of your VPN server. WireGuard will listen on that (othwise default) inside the Docker container.                                                                                               |
| `WG_CONFIG_PORT`              | `51820`           | `12345`                        | The UDP port used on [Home Assistant Plugin](https://github.com/adriy-be/homeassistant-addons-jdeath/tree/main/wgeasy)                                                                                             |
| `WG_MTU`                      | `null`            | `1420`                         | The MTU the clients will use. Server uses default WG MTU.                                                                                                                                                          |
| `WG_PERSISTENT_KEEPALIVE`     | `0`               | `25`                           | Value in seconds to keep the "connection" open. If this value is 0, then connections won't be kept alive.                                                                                                          |
| `WG_DEFAULT_ADDRESS`          | `10.8.0.x`        | `10.6.0.x`                     | Clients IP address range.                                                                                                                                                                                          |
| `WG_DEFAULT_DNS`              | `1.1.1.1`         | `8.8.8.8, 8.8.4.4`             | DNS server clients will use. If set to blank value, clients will not use any DNS.                                                                                                                                  |
| `WG_ALLOWED_IPS`              | `0.0.0.0/0, ::/0` | `192.168.15.0/24, 10.0.1.0/24` | Allowed IPs clients will use.                                                                                                                                                                                      |
| `WG_PRE_UP`                   | `...`             | -                              | See [config.js](./src/config.js) for the default value.                                                                                                                                                            |
| `WG_POST_UP`                  | `...`             | `iptables ...`                 | See [config.js](./src/config.js) for the default value.                                                                                                                                                            |
| `WG_PRE_DOWN`                 | `...`             | -                              | See [config.js](./src/config.js) for the default value.                                                                                                                                                            |
| `WG_POST_DOWN`                | `...`             | `iptables ...`                 | See [config.js](./src/config.js) for the default value.                                                                                                                                                            |
| `WG_ENABLE_EXPIRES_TIME`      | -                 | -                              | Deprecated: client expiry is now always enabled.                                                                                                                                                                   |
| `LANG`                        | `en`              | `de`                           | Web UI language (Supports: en, ua, ru, tr, no, pl, fr, de, ca, es, ko, vi, nl, is, pt, chs, cht, it, th, hi).                                                                                                      |
| `UI_TRAFFIC_STATS`            | `false`           | `true`                         | Enable detailed RX / TX client stats in Web UI                                                                                                                                                                     |
| `UI_CHART_TYPE`               | `0`               | `1`                            | UI_CHART_TYPE=0 # Charts disabled, UI_CHART_TYPE=1 # Line chart, UI_CHART_TYPE=2 # Area chart, UI_CHART_TYPE=3 # Bar chart                                                                                         |
| `DICEBEAR_TYPE`               | `false`           | `bottts`                       | see [dicebear styles](https://www.dicebear.com/styles/)                                                                                                                                                            |
| `USE_GRAVATAR`                | `false`           | `true`                         | Use or not GRAVATAR service                                                                                                                                                                                        |
| `WG_ENABLE_ONE_TIME_LINKS`    | `false`           | `true`                         | Enable display and generation of short one time download links (expire after 5 minutes)                                                                                                                            |
| `MAX_AGE`                     | `0`               | `1440`                         | The maximum age of Web UI sessions in minutes. `0` means that the session will exist until the browser is closed.                                                                                                  |
| `UI_ENABLE_SORT_CLIENTS`      | `false`           | `true`                         | Enable UI sort clients by name                                                                                                                                                                                     |
| `ENABLE_PROMETHEUS_METRICS`   | `false`           | `true`                         | Enable Prometheus metrics `http://0.0.0.0:51821/metrics` and `http://0.0.0.0:51821/metrics/json`                                                                                                                   |
| `PROMETHEUS_METRICS_PASSWORD` | -                 | `$2y$05$Ci...`                 | If set, Basic Auth is required when requesting metrics.                                                                                                                                                            |
| `JC`                          | `random 4..8`     | `5`                            | Junk packet count. Validation: integer `0..128`.                                                                                                                                                                   |
| `JMIN`                        | `64`              | `25`                           | Junk packet minimum size. Validation: integer `0..1279`, and no greater than `JMAX`.                                                                                                                               |
| `JMAX`                        | `512`             | `250`                          | Junk packet maximum size. Validation: integer `0..1279`, and no less than `JMIN`.                                                                                                                                  |
| `S1`                          | `random 15..64`   | `32`                           | Init packet padding size. Validation: integer `0..64`.                                                                                                                                                             |
| `S2`                          | `random 15..64`   | `40`                           | Response packet padding size. Validation: integer `0..64`.                                                                                                                                                         |
| `S3`                          | `random 15..64`   | `24`                           | Additional AWG 2 padding size. Validation: integer `0..64`; the generated default is non-zero.                                                                                                                    |
| `S4`                          | `random 8..32`    | `16`                           | Additional AWG 2 padding size. Validation: integer `0..32`; the generated default is non-zero.                                                                                                                    |
| `H1`                          | `random unique 5..2147483647` | `1000000001`                   | Init packet magic header. Validation: unique integer `5..2147483647`.                                                                                                                                              |
| `H2`                          | `random unique 5..2147483647` | `1000000002`                   | Response packet magic header. Validation: unique integer `5..2147483647`.                                                                                                                                         |
| `H3`                          | `random unique 5..2147483647` | `1000000003`                   | Underload packet magic header. Validation: unique integer `5..2147483647`.                                                                                                                                          |
| `H4`                          | `random unique 5..2147483647` | `1000000004`                   | Transport packet magic header. Validation: unique integer `5..2147483647`.                                                                                                                                          |
| `I1`                          | empty             | -                              | Optional AWG 2 signature expression. Validation: string; empty is allowed.                                                                                                                                         |
| `I2`                          | empty             | -                              | Optional AWG 2 signature expression. Validation: string; empty is allowed.                                                                                                                                         |
| `I3`                          | empty             | -                              | Optional AWG 2 signature expression. Validation: string; empty is allowed.                                                                                                                                         |
| `I4`                          | empty             | -                              | Optional AWG 2 signature expression. Validation: string; empty is allowed.                                                                                                                                         |
| `I5`                          | empty             | -                              | Optional AWG 2 signature expression. Validation: string; empty is allowed.                                                                                                                                         |

> If you change `WG_PORT`, make sure to also change the exposed port.

### Breaking migration: refresh every client profile

This release changes the interface-wide AWG framing parameters. Existing
downloaded profiles are not backward-compatible with the migrated server, so
plan a short client refresh window:

1. Back up the Docker volume that contains `/etc/wireguard` before upgrading.
2. Deploy the image containing the pinned AWG 2.0.0 backend.
3. Confirm that the one-time migration created
   `/etc/wireguard/wg0.awg1.backup.json`:

   ```bash
   docker exec amnezia-wg-ui test -f /etc/wireguard/wg0.awg1.backup.json
   ```

4. Download every client `.conf` again from the admin panel.
5. Import each new file into a current AWG 2-capable client and connect.

Do not reuse a previously downloaded profile after migration. Server and client
keys are retained, but the old interface parameters differ from the new
persisted v2 values.

### Diagnostics

Run these commands on the host while attempting a connection:

```bash
sudo tcpdump -ni any 'udp port 51820'
docker exec amnezia-wg-easy wg show wg0
docker exec amnezia-wg-easy wg show wg0 latest-handshakes
```

Interpret the results as follows:

- **No UDP:** packets are not reaching the host; check the endpoint address,
  exposed UDP port, firewall, NAT, and cloud security rules.
- **UDP without a handshake:** the endpoint is reachable but the client is not
  completing WireGuard negotiation; use a freshly downloaded profile and an
  AWG 2-capable client, then check keys and the persisted `S3`/`S4` values.
- **Handshake without bidirectional traffic:** negotiation succeeded but data
  is not traversing the tunnel; check forwarding/NAT, `AllowedIPs`, routes,
  counters, and DNS configuration.

### Rollback

Keep `wg0.awg1.backup.json` until all five platform checks below pass. To roll
back, stop the AWG 2 container, restore the previous application image, copy
the legacy backup over `wg0.json`, and start the previous container again.

For the installer deployment under `/opt/amnezia-wg-ui`, use this named-volume
procedure. Run it before an update while the current container still exists;
the inspect steps deliberately resolve the actual Compose-created volume name
instead of assuming that it is `awg_data` or has a particular project prefix.

```bash
set -eu
cd /opt/amnezia-wg-ui
CONTAINER=amnezia-wg-ui

# Capture and tag the exact image used by the running container before updating.
PREVIOUS_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$CONTAINER")"
test -n "$PREVIOUS_IMAGE_ID"
ROLLBACK_IMAGE="local/amnezia-wg-ui:rollback-$(date -u +%Y%m%dT%H%M%SZ)"
docker image tag "$PREVIOUS_IMAGE_ID" "$ROLLBACK_IMAGE"

# Resolve and validate the exact named volume mounted at /etc/wireguard.
WIREGUARD_MOUNT_TYPE="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/etc/wireguard"}}{{.Type}}{{end}}{{end}}' "$CONTAINER")"
test "$WIREGUARD_MOUNT_TYPE" = volume
WIREGUARD_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/etc/wireguard"}}{{if eq .Type "volume"}}{{.Name}}{{end}}{{end}}{{end}}' "$CONTAINER")"
test -n "$WIREGUARD_VOLUME"
docker volume inspect "$WIREGUARD_VOLUME" >/dev/null

# Stop the service, then verify and restore the migration backup in that volume.
docker compose stop amnezia-wg-ui
docker run --rm -v "$WIREGUARD_VOLUME:/etc/wireguard" alpine:3.20 \
  sh -ec 'test -f /etc/wireguard/wg0.awg1.backup.json; cp /etc/wireguard/wg0.awg1.backup.json /etc/wireguard/wg0.json'

# Recreate the service with the saved pre-update image (the override is temporary).
ROLLBACK_OVERRIDE="$(mktemp)"
trap 'rm -f "$ROLLBACK_OVERRIDE"' EXIT
printf 'services:\n  amnezia-wg-ui:\n    image: %s\n' "$ROLLBACK_IMAGE" > "$ROLLBACK_OVERRIDE"
docker compose -f docker-compose.yml -f "$ROLLBACK_OVERRIDE" up -d --force-recreate
```

The `test` commands stop on a missing or wrong-type mount, and the helper uses
only the resolved volume name. Do not run `docker compose down -v`; that would
remove the data needed for rollback. The temporary Compose override is removed
by the `trap` after the previous image is running.

For a bind-mounted data directory, resolve and tag the previous image before
stopping/removing the container, then copy the backup in the host directory and
re-run the original `docker run` command with the saved tag:

```bash
set -eu
CONTAINER=amnezia-wg-ui
PREVIOUS_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$CONTAINER")"
test -n "$PREVIOUS_IMAGE_ID"
ROLLBACK_IMAGE="local/amnezia-wg-ui:rollback-$(date -u +%Y%m%dT%H%M%SZ)"
docker image tag "$PREVIOUS_IMAGE_ID" "$ROLLBACK_IMAGE"
docker stop amnezia-wg-ui
docker rm amnezia-wg-ui
# Set this to the bind mount used by the original docker run command.
BIND_WIREGUARD_DIR=/path/to/wireguard
test -f "$BIND_WIREGUARD_DIR/wg0.awg1.backup.json"
cp "$BIND_WIREGUARD_DIR/wg0.awg1.backup.json" "$BIND_WIREGUARD_DIR/wg0.json"
# Re-run the original docker run command with "$ROLLBACK_IMAGE" as its image.
```

Do not overwrite or delete the backup until rollback is no longer needed.

### Required platform acceptance matrix

This is a release gate, not a record of completed manual validation. On each
platform use the latest available official AWG 2-capable client. AmneziaVPN
must be at least `4.8.12.9`; native AmneziaWG clients must explicitly support
non-zero `S3` and `S4`.

| Platform | Required checks |
|----------|-----------------|
| Windows | Import a freshly downloaded `.conf`; observe a non-zero fresh handshake timestamp, increasing RX and TX counters, IPv4 web access, and DNS success. |
| Android | Import a freshly downloaded `.conf`; observe a non-zero fresh handshake timestamp, increasing RX and TX counters, IPv4 web access, and DNS success. |
| Linux | Import a freshly downloaded `.conf`; observe a non-zero fresh handshake timestamp, increasing RX and TX counters, IPv4 web access, and DNS success. |
| macOS | Import a freshly downloaded `.conf`; observe a non-zero fresh handshake timestamp, increasing RX and TX counters, IPv4 web access, and DNS success. |
| iOS | Import a freshly downloaded `.conf`; observe a non-zero fresh handshake timestamp, increasing RX and TX counters, IPv4 web access, and DNS success. |

Connection UI state alone is not acceptance evidence; all five platforms must
show a handshake and bidirectional traffic before the migration is considered
complete.

## Updating

```bash
docker stop amnezia-wg-ui
docker rm amnezia-wg-ui
docker pull ghcr.io/cmtrswtng/amnezia-wg-ui
```

And then run the `docker run -d \ ...` command above again.

## Credits

This project is a fork of [amnezia-wg-easy](https://github.com/w0rng/amnezia-wg-easy) by [@w0rng](https://github.com/w0rng),
which is based on [wg-easy](https://github.com/wg-easy/wg-easy) by Emile Nijssen and uses the AmneziaWG integration
from [amnezia-wg-easy](https://github.com/spcfox/amnezia-wg-easy) by Viktor Yudov.

The fork adds the redesigned admin UI, client tags, traffic quotas, bulk actions, the sales dashboard and the audit log.
