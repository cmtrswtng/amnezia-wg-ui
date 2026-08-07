#!/usr/bin/env bash
#
# AmneziaWG UI — one-line installer
#
#   bash <(curl -Ls https://raw.githubusercontent.com/cmtrswtng/amnezia-wg-ui/master/install.sh)
#
# Installs Docker if missing, asks for the public host and an admin
# password, writes /opt/amnezia-wg-ui/{.env,docker-compose.yml} and
# starts the container. Re-running performs an update.

set -euo pipefail

INSTALL_DIR=/opt/amnezia-wg-ui
IMAGE=ghcr.io/cmtrswtng/amnezia-wg-ui:latest

color() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
info() { echo "$(color '0;36' '[INFO]') $*"; }
ok() { echo "$(color '0;32' '[OK]') $*"; }
err() { echo "$(color '0;31' '[ERROR]') $*" >&2; exit 1; }

[[ "$(uname -s)" == "Linux" ]] || err "This installer supports Linux only."
[[ $EUID -eq 0 ]] || err "Please run as root (or via sudo)."

# --- Re-run on an existing installation: update only ------------------------
if [[ -f "${INSTALL_DIR}/docker-compose.yml" && "${1:-}" != "--reconfigure" ]]; then
  info "Existing installation found in ${INSTALL_DIR}."
  read -rp "Update to the latest image? [Y/n] " answer
  if [[ "${answer:-Y}" =~ ^[Yy]?$ ]]; then
    cd "$INSTALL_DIR"
    docker compose pull
    docker compose up -d
    ok "Updated. Web UI: http://$(grep -E '^WG_HOST=' .env | cut -d= -f2):$(grep -E '^PORT=' .env | cut -d= -f2 || echo 51821)"
    exit 0
  fi
  info "Re-running full setup (existing .env will be replaced)…"
fi

# --- Docker -----------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  info "Docker not found — installing…"
  curl -sSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker compose version >/dev/null 2>&1 || err "Docker Compose plugin is missing. Install it: https://docs.docker.com/compose/install/linux/"
ok "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) ready."

# --- Public host ------------------------------------------------------------
detected_host="$(curl -4 -s --max-time 5 https://api.ipify.org || curl -4 -s --max-time 5 https://ifconfig.me || true)"
read -rp "Public IP or hostname of this server [${detected_host}]: " input_host
WG_HOST="${input_host:-$detected_host}"
[[ -n "$WG_HOST" ]] || err "WG_HOST is required (public IP or hostname)."

read -rp "Web UI port [51821]: " input_port
PORT="${input_port:-51821}"
read -rp "WireGuard UDP port [51820]: " input_wgport
WG_PORT="${input_wgport:-51820}"

# --- Admin password (asked twice, hidden) ------------------------------------
while true; do
  read -rsp "Admin password for the Web UI: " pass1; echo
  [[ -n "$pass1" ]] || { echo "Password must not be empty."; continue; }
  read -rsp "Confirm password: " pass2; echo
  [[ "$pass1" == "$pass2" ]] && break
  echo "Passwords do not match, try again."
done

# --- Image + password hash ----------------------------------------------------
info "Pulling ${IMAGE}…"
docker pull "$IMAGE" >/dev/null

HASH="$(docker run --rm "$IMAGE" wgpw "$pass1" | sed -n "s/^PASSWORD_HASH='\(.*\)'\$/\1/p")"
[[ -n "$HASH" ]] || err "Failed to generate the password hash."
ok "Password hash generated."

# Docker Compose (2.24+) expands $VAR inside .env files; bcrypt hashes are
# full of '$', so escape them as '$$' — otherwise the hash gets mangled.
ESCAPED_HASH="${HASH//\$/\$\$}"

# --- Files --------------------------------------------------------------------
mkdir -p "$INSTALL_DIR"

cat > "${INSTALL_DIR}/.env" <<EOF
WG_HOST=${WG_HOST}
PORT=${PORT}
WG_PORT=${WG_PORT}
LANG=en
PASSWORD_HASH=${ESCAPED_HASH}
EOF
chmod 600 "${INSTALL_DIR}/.env"

cat > "${INSTALL_DIR}/docker-compose.yml" <<'EOF'
services:
  amnezia-wg-ui:
    image: ghcr.io/cmtrswtng/amnezia-wg-ui:latest
    container_name: amnezia-wg-ui
    env_file:
      - .env
    volumes:
      - awg_data:/etc/wireguard
    ports:
      - "${WG_PORT}:${WG_PORT}/udp"
      - "${PORT}:${PORT}/tcp"
    restart: unless-stopped
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      - net.ipv4.ip_forward=1
      - net.ipv4.conf.all.src_valid_mark=1
    devices:
      - /dev/net/tun:/dev/net/tun

volumes:
  awg_data:
EOF
ok "Files written to ${INSTALL_DIR}."

# --- Firewall (only if ufw is active) -----------------------------------------
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active'; then
  ufw allow "${WG_PORT}/udp" >/dev/null
  ufw allow "${PORT}/tcp" >/dev/null
  ok "ufw: allowed ${WG_PORT}/udp and ${PORT}/tcp."
else
  info "ufw not active — make sure ${WG_PORT}/udp and ${PORT}/tcp are open (cloud firewall, etc.)."
fi

# --- Start ----------------------------------------------------------------------
cd "$INSTALL_DIR"
docker compose up -d

# --- Self-check: the container must see a hash that matches the password -------
sleep 3
ACTUAL_HASH="$(docker exec amnezia-wg-ui printenv PASSWORD_HASH 2>/dev/null || true)"
if [[ -n "$ACTUAL_HASH" ]] && docker exec amnezia-wg-ui wgpw "$pass1" "$ACTUAL_HASH" | grep -q 'matches'; then
  ok "Password verified against the running container."
else
  err "Password verification failed — please report this. Hash in .env: ${ESCAPED_HASH:0:12}…"
fi
unset pass1

echo
ok "AmneziaWG UI is up!"
echo "  Web UI:   http://${WG_HOST}:${PORT}"
echo "  Password: the one you just set"
echo
echo "  Logs:     cd ${INSTALL_DIR} && docker compose logs -f"
echo "  Update:   re-run this script anytime"
