#!/usr/bin/env bash
#
# AmneziaWG UI — one-line installer
#
#   curl -fsSL https://raw.githubusercontent.com/cmtrswtng/amnezia-wg-ui/master/install.sh -o install-awg.sh
#   sudo bash install-awg.sh [--instance NAME] [--image IMAGE]
#
# Installs Docker if missing, asks for the public host and an admin
# password, writes /opt/amnezia-wg-ui/{.env,docker-compose.yml} and
# starts the container. Named instances use independent directories, containers
# and Compose projects/volumes. Re-running updates only the selected instance.

set -euo pipefail

IMAGE=ghcr.io/cmtrswtng/amnezia-wg-ui:latest
IMAGE_GIVEN=0
INSTANCE=
RECONFIGURE=0

color() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
info() { echo "$(color '0;36' '[INFO]') $*"; }
ok() { echo "$(color '0;32' '[OK]') $*"; }
err() { echo "$(color '0;31' '[ERROR]') $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: sudo bash install-awg.sh [options]
  --instance NAME  Independent installation in /opt/amnezia-wg-ui-NAME
                   with its own container, Compose project and data volume.
  --image IMAGE    Docker image/tag or digest. New installations default to
                   ghcr.io/cmtrswtng/amnezia-wg-ui:latest; updates keep the
                   saved image unless this option explicitly changes it.
  --reconfigure   Back up and replace the selected installation's settings.
  --help          Show this help without changing anything.

Without --instance, manage the original /opt/amnezia-wg-ui installation.
Named installs default to UI 51823/TCP, VPN 51822/UDP and subnet 10.9.0.x.
You can choose different ports at the prompts. Existing instances are untouched.
EOF
}
while (( $# )); do
  case "$1" in
    --instance)
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || err '--instance requires a name.'
      INSTANCE="$2"; shift 2;;
    --image)
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || err '--image requires a Docker image.'
      IMAGE="$2"; IMAGE_GIVEN=1; shift 2;;
    --reconfigure) RECONFIGURE=1; shift;;
    --help|-h) usage; exit 0;;
    *) err "Unknown argument: $1. Use --help.";;
  esac
done
[[ -z "$INSTANCE" || "$INSTANCE" =~ ^[a-z0-9][a-z0-9_-]{0,31}$ ]] || err 'Instance names must be 1-32 lowercase letters, digits, underscores or hyphens, starting with a letter/digit.'
[[ "$IMAGE" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$ ]] || err 'Invalid Docker image reference.'
CONTAINER_NAME="amnezia-wg-ui${INSTANCE:+-$INSTANCE}"
INSTALL_DIR="/opt/$CONTAINER_NAME"
PROJECT_NAME="$CONTAINER_NAME"
DEFAULT_PORT=51821
DEFAULT_WG_PORT=51820
WG_DEFAULT_ADDRESS=10.8.0.x
if [[ -n "$INSTANCE" ]]; then
  DEFAULT_PORT=51823
  DEFAULT_WG_PORT=51822
  WG_DEFAULT_ADDRESS=10.9.0.x
fi
compose() {
  if [[ -n "$INSTANCE" ]]; then
    docker compose --project-name "$CONTAINER_NAME" "$@"
  else
    docker compose "$@"
  fi
}

[[ "$(uname -s)" == "Linux" ]] || err "This installer supports Linux only."
[[ $EUID -eq 0 ]] || err 'Please run the downloaded file via sudo: sudo bash install-awg.sh [options].'

# --- Re-run on an existing installation: update only ------------------------
if [[ -f "${INSTALL_DIR}/docker-compose.yml" && "$RECONFIGURE" == 0 ]]; then
  info "Existing installation found in ${INSTALL_DIR}."
  read -rp "Update only this installation using its saved image (or explicit --image)? [Y/n] " answer
  if [[ "${answer:-Y}" =~ ^[Yy]?$ ]]; then
    cd "$INSTALL_DIR"
    if [[ "$IMAGE_GIVEN" == 1 ]]; then
      [[ "$(grep -c '^    image:' docker-compose.yml)" == 1 ]] || err 'Custom Compose file: change the image manually before updating.'
      cp -p docker-compose.yml "docker-compose.before-image.$(date +%Y%m%d-%H%M%S).yml"
      sed "s|^    image:.*|    image: $IMAGE|" docker-compose.yml > docker-compose.yml.tmp
      mv docker-compose.yml.tmp docker-compose.yml
    fi
    compose config --quiet
    compose pull
    compose up -d
    ok "Updated. Web UI: http://$(grep -E '^WG_HOST=' .env | cut -d= -f2):$(grep -E '^PORT=' .env | cut -d= -f2 || echo 51821)"
    exit 0
  fi
  info 'Update cancelled. Settings were not changed.'
  exit 0
fi

# --- Docker -----------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  info "Docker not found — installing…"
  curl -sSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker compose version >/dev/null 2>&1 || err "Docker Compose plugin is missing. Install it: https://docs.docker.com/compose/install/linux/"
ok "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) ready."
if [[ "$RECONFIGURE" == 1 && -f "$INSTALL_DIR/docker-compose.yml" ]]; then
  if [[ "$IMAGE_GIVEN" == 0 ]]; then
    IMAGE="$(cd "$INSTALL_DIR" && compose config --images)"
    [[ "$IMAGE" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$ ]] || err 'Cannot determine the saved image. Specify --image explicitly.'
  fi
  saved_project="$(grep -m1 '^COMPOSE_PROJECT_NAME=' "$INSTALL_DIR/.env" | cut -d= -f2- || true)"
  if [[ -n "$saved_project" ]]; then
    [[ "$saved_project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || err 'Unsupported saved Compose project name. Preserve the settings and configure it manually.'
    [[ -z "$INSTANCE" || "$saved_project" == "$CONTAINER_NAME" ]] || err 'Named instance has an unexpected Compose project. Preserve its settings and configure it manually.'
    PROJECT_NAME="$saved_project"
  fi
fi
if [[ ! -f "$INSTALL_DIR/docker-compose.yml" ]]; then
  if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    err "Container $CONTAINER_NAME already exists outside this installation. Choose another --instance."
  fi
  [[ ! -e "$INSTALL_DIR/.env" ]] || err "Existing settings found in $INSTALL_DIR without a Compose file. Preserve them and choose another --instance."
fi

# --- Public host ------------------------------------------------------------
detected_host="$(curl -4 -s --max-time 5 https://api.ipify.org || curl -4 -s --max-time 5 https://ifconfig.me || true)"
read -rp "Public IP or hostname of this server [${detected_host}]: " input_host
WG_HOST="${input_host:-$detected_host}"
[[ -n "$WG_HOST" ]] || err "WG_HOST is required (public IP or hostname)."

read -rp "Web UI port [${DEFAULT_PORT}]: " input_port
PORT="${input_port:-$DEFAULT_PORT}"
read -rp "WireGuard UDP port [${DEFAULT_WG_PORT}]: " input_wgport
WG_PORT="${input_wgport:-$DEFAULT_WG_PORT}"
for selected_port in "$PORT" "$WG_PORT"; do
  [[ "$selected_port" =~ ^[0-9]{1,5}$ ]] && (( 10#$selected_port >= 1 && 10#$selected_port <= 65535 )) || err 'Ports must be integers from 1 to 65535.'
done
# Normalize leading zeroes so Compose and AWG use the same decimal port.
PORT=$((10#$PORT))
WG_PORT=$((10#$WG_PORT))
check_port() {
  local port="$1" protocol="$2" bindings ids id listeners owner own_port=0
  ids="$(docker ps -q)"
  for id in $ids; do
    bindings="$(docker inspect --format '{{range $port, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{printf "%s %s\n" .HostPort $port}}{{end}}{{end}}' "$id")"
    if awk -v port="$port" -v protocol="$protocol" '$1 == port && $2 ~ ("/" protocol "$") { found=1 } END { exit !found }' <<< "$bindings"; then
      owner="$(docker inspect --format '{{.Name}}' "$id")"
      if [[ "$RECONFIGURE" == 1 && -f "$INSTALL_DIR/docker-compose.yml" && "$owner" == "/$CONTAINER_NAME" ]]; then
        own_port=1
      else
        err "Port $port/$protocol is already published by container $id. Choose another port."
      fi
    fi
  done
  # An unchanged published port already belongs to the selected container.
  [[ "$own_port" == 0 ]] || return 0
  command -v ss >/dev/null 2>&1 || err 'The ss utility is required for port checks. Install iproute2 and retry.'
  if [[ "$protocol" == tcp ]]; then
    listeners="$(ss -H -lnt "sport = :$port")"
  else
    listeners="$(ss -H -lnu "sport = :$port")"
  fi
  [[ -z "$listeners" ]] || err "Port $port/$protocol is already in use. Choose another port."
}
check_port "$PORT" tcp
check_port "$WG_PORT" udp

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
if [[ "$RECONFIGURE" == 1 && -f "$INSTALL_DIR/docker-compose.yml" ]]; then
  backup_suffix="$(date +%Y%m%d-%H%M%S)"
  cp -p "$INSTALL_DIR/docker-compose.yml" "$INSTALL_DIR/docker-compose.before-reconfigure.$backup_suffix.yml"
  [[ ! -f "$INSTALL_DIR/.env" ]] || cp -p "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.before-reconfigure.$backup_suffix"
fi

cat > "${INSTALL_DIR}/.env" <<EOF
COMPOSE_PROJECT_NAME=${PROJECT_NAME}
WG_HOST=${WG_HOST}
PORT=${PORT}
WG_PORT=${WG_PORT}
WG_DEFAULT_ADDRESS=${WG_DEFAULT_ADDRESS}
LANG=en
WG_ALLOWED_IPS=0.0.0.0/0
WG_DEFAULT_DNS=77.88.8.8, 77.88.8.1
WG_MTU=1280
WG_PERSISTENT_KEEPALIVE=20-25
PASSWORD_HASH=${ESCAPED_HASH}
EOF
chmod 600 "${INSTALL_DIR}/.env"

cat > "${INSTALL_DIR}/docker-compose.yml" <<EOF
services:
  amnezia-wg-ui:
    image: ${IMAGE}
    container_name: ${CONTAINER_NAME}
    env_file:
      - .env
    volumes:
      - awg_data:/etc/wireguard
    ports:
      - "\${WG_PORT}:\${WG_PORT}/udp"
      - "\${PORT}:\${PORT}/tcp"
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
compose config --quiet
compose up -d

# --- Self-check: the container must see a hash that matches the password -------
sleep 3
ACTUAL_HASH="$(docker exec "$CONTAINER_NAME" printenv PASSWORD_HASH 2>/dev/null || true)"
if [[ -n "$ACTUAL_HASH" ]] && docker exec "$CONTAINER_NAME" wgpw "$pass1" "$ACTUAL_HASH" | grep -q 'matches'; then
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
if [[ -n "$INSTANCE" ]]; then
  echo "  Update:   sudo bash install-awg.sh --instance $INSTANCE"
else
  echo "  Update:   sudo bash install-awg.sh"
fi
