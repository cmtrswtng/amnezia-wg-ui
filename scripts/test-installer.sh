#!/usr/bin/env bash
set -euo pipefail

# Run only in a disposable container, without a Docker socket. All Docker and
# network commands below are fakes; the real installer and its files are tested.
[[ -f /.dockerenv && "${AWG_INSTALLER_TEST_CONTAINER:-}" == 1 ]] || {
  echo 'Run this test in a disposable Docker container with AWG_INSTALLER_TEST_CONTAINER=1.' >&2
  exit 1
}
repo="$(cd "$(dirname "$0")/.." && pwd)"
sandbox="$(mktemp -d)"
mkdir -p "$sandbox/bin" /opt/amnezia-wg-ui
export INSTALLER_TEST_LOG="$sandbox/docker.log"
export PATH="$sandbox/bin:$PATH"
cat > "$sandbox/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$INSTALLER_TEST_LOG"
printf '%s\n' "$PWD" >> "$INSTALLER_TEST_LOG.cwd"
if [[ "$1" == compose ]]; then
  shift
  [[ "${1:-}" != --project-name ]] || shift 2
  case "$*" in
    version|'config --quiet'|pull|'up -d') exit 0;;
    'config --images') awk '$1 == "image:" { print $2 }' docker-compose.yml; exit 0;;
    *) echo "Unexpected Compose command: $*" >&2; exit 64;;
  esac
fi
case "$*" in
  --version) echo 'Docker version 28.0.0';;
  'ps -q') [[ "${TEST_BUSY_DOCKER:-}${TEST_OWN_DOCKER:-}" == *1* ]] && echo occupied || true;;
  'inspect --format '*'.NetworkSettings.Ports'*)
    if [[ "${TEST_OWN_DOCKER:-}" == 1 ]]; then
      printf '51823 51823/tcp 0.0.0.0\n51822 51822/udp 0.0.0.0\n'
    else
      printf '51822 51820/udp 0.0.0.0\n'
    fi;;
  'inspect --format '*)
    if [[ "${TEST_OWN_DOCKER:-}" == 1 ]]; then echo '/amnezia-wg-ui-awg31'; else echo '/other-container'; fi;;
  'container inspect '*) exit 1;;
  pull\ *) :;;
  'run --rm '*) echo "PASSWORD_HASH='\$2b\$10\$test-only-hash'";;
  'exec '*\ printenv\ PASSWORD_HASH) printf '%s\n' '$2b$10$test-only-hash';;
  'exec '*\ wgpw\ *) echo 'Password matches';;
  *) echo "Unexpected Docker command: $*" >&2; exit 64;;
esac
EOF
cat > "$sandbox/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo 203.0.113.10
EOF
cat > "$sandbox/bin/ss" <<'EOF'
#!/usr/bin/env bash
[[ "${TEST_BUSY_TCP:-}" == 1 && "$*" == *'-lnt'* ]] && echo 'LISTEN test-listener' || true
EOF
printf '#!/usr/bin/env bash\nexit 0\n' > "$sandbox/bin/sleep"
printf '#!/usr/bin/env bash\nexit 0\n' > "$sandbox/bin/ufw"
chmod +x "$sandbox/bin/"*

# This installation represents the existing AWG 2 service and must stay intact.
printf 'WG_HOST=old.example\nPORT=51821\nWG_PORT=51820\nPASSWORD_HASH=old-secret\n' > /opt/amnezia-wg-ui/.env
cat > /opt/amnezia-wg-ui/docker-compose.yml <<'EOF'
services:
  amnezia-wg-ui:
    image: example/old:2
    container_name: amnezia-wg-ui
    volumes:
      - awg_data:/etc/wireguard
volumes:
  awg_data:
EOF
cp /opt/amnezia-wg-ui/.env "$sandbox/old.env"
cp /opt/amnezia-wg-ui/docker-compose.yml "$sandbox/old.compose"

fail() { echo "FAIL: $*" >&2; exit 1; }
unchanged_old() {
  cmp "$sandbox/old.env" /opt/amnezia-wg-ui/.env || fail 'Old environment changed'
  cmp "$sandbox/old.compose" /opt/amnezia-wg-ui/docker-compose.yml || fail 'Old Compose changed'
}
reject() {
  : > "$INSTALLER_TEST_LOG"
  if bash "$repo/install.sh" "$@" < /dev/null > "$sandbox/output" 2>&1; then fail "Accepted invalid arguments: $*"; fi
  [[ ! -s "$INSTALLER_TEST_LOG" ]] || fail 'Invalid arguments reached Docker'
  unchanged_old
}
answers() { printf '203.0.113.10\n51823\n51822\ntest-password\ntest-password\n'; }

bash "$repo/install.sh" --help > "$sandbox/help" || fail 'Help failed'
grep -q -- '--instance' "$sandbox/help" || fail 'Instance help missing'
reject --unknown
reject --instance '../old'
reject --instance
reject --image
reject --image 'bad|image'
echo 'PASS: help and argument validation'

: > "$INSTALLER_TEST_LOG"
answers | bash "$repo/install.sh" --instance awg31 --image ghcr.io/cmtrswtng/amnezia-wg-ui:17 > "$sandbox/output" 2>&1 || { cat "$sandbox/output"; fail 'Named installation failed'; }
named=/opt/amnezia-wg-ui-awg31
[[ -f "$named/.env" && -f "$named/docker-compose.yml" ]] || fail 'Named instance files missing'
grep -q 'container_name: amnezia-wg-ui-awg31$' "$named/docker-compose.yml" || fail 'Container is not isolated'
grep -q 'image: ghcr.io/cmtrswtng/amnezia-wg-ui:17$' "$named/docker-compose.yml" || fail 'Image pin ignored'
grep -q '^COMPOSE_PROJECT_NAME=amnezia-wg-ui-awg31$' "$named/.env" || fail 'Volume project is not isolated'
grep -q '^WG_DEFAULT_ADDRESS=10.9.0.x$' "$named/.env" || fail 'New tunnel subnet missing'
grep -q '^PORT=51823$' "$named/.env" || fail 'UI port ignored'
grep -q '^WG_PORT=51822$' "$named/.env" || fail 'VPN port ignored'
grep -q 'exec amnezia-wg-ui-awg31 ' "$INSTALLER_TEST_LOG" || fail 'Password check used the old container'
if grep -q '^exec amnezia-wg-ui ' "$INSTALLER_TEST_LOG"; then fail 'Old container was accessed'; fi
unchanged_old
cp "$named/.env" "$sandbox/named.env"
echo 'PASS: isolated files, container, project/volume, ports, image and password check'

: > "$INSTALLER_TEST_LOG"
: > "$INSTALLER_TEST_LOG.cwd"
printf 'y\n' | bash "$repo/install.sh" --instance awg31 > "$sandbox/output" 2>&1 || fail 'Named update failed'
cmp "$sandbox/named.env" "$named/.env" || fail 'Update replaced passwords/settings'
grep -q 'image: ghcr.io/cmtrswtng/amnezia-wg-ui:17$' "$named/docker-compose.yml" || fail 'Update lost image pin'
unchanged_old
if grep -Fxq /opt/amnezia-wg-ui "$INSTALLER_TEST_LOG.cwd"; then fail 'Named update ran Docker from the old directory'; fi
echo 'PASS: update retains named instance settings and image pin'

printf 'y\n' | bash "$repo/install.sh" --instance awg31 --image example/awg:pinned > "$sandbox/output" 2>&1 || fail 'Explicit image update failed'
grep -q 'image: example/awg:pinned$' "$named/docker-compose.yml" || fail 'Explicit image update ignored'
cmp "$sandbox/named.env" "$named/.env" || fail 'Image update changed secrets/settings'
unchanged_old
echo 'PASS: explicit image updates only the selected instance'

answers | bash "$repo/install.sh" --instance awg31 --reconfigure > "$sandbox/output" 2>&1 || { cat "$sandbox/output"; fail 'Named reconfiguration failed'; }
grep -q 'image: example/awg:pinned$' "$named/docker-compose.yml" || fail 'Reconfiguration lost image pin'
answers | TEST_OWN_DOCKER=1 TEST_BUSY_TCP=1 bash "$repo/install.sh" --instance awg31 --reconfigure > "$sandbox/output" 2>&1 || { cat "$sandbox/output"; fail 'Reconfiguration rejected its own published ports'; }
cp "$named/docker-compose.yml" "$sandbox/named.compose"
cp "$named/.env" "$sandbox/named.env"
if answers | TEST_BUSY_DOCKER=1 bash "$repo/install.sh" --instance awg31 --reconfigure > "$sandbox/output" 2>&1; then fail 'Reconfiguration accepted another container port'; fi
cmp "$sandbox/named.compose" "$named/docker-compose.yml" || fail 'Conflicting reconfigure changed Compose'
cmp "$sandbox/named.env" "$named/.env" || fail 'Conflicting reconfigure changed settings'
unchanged_old
echo 'PASS: reconfiguration preserves the image and rejects other occupied ports'

: > "$INSTALLER_TEST_LOG"
printf 'n\n' | bash "$repo/install.sh" --instance awg31 > "$sandbox/output" 2>&1 || fail 'Cancel failed'
[[ ! -s "$INSTALLER_TEST_LOG" ]] || fail 'Cancelled update reached Docker'
cmp "$sandbox/named.env" "$named/.env" || fail 'Cancel changed settings'
echo 'PASS: declining an update cancels without reconfiguration'

if answers | TEST_BUSY_TCP=1 bash "$repo/install.sh" --instance busy-tcp > "$sandbox/output" 2>&1; then fail 'Accepted occupied TCP port'; fi
[[ ! -e /opt/amnezia-wg-ui-busy-tcp/.env ]] || fail 'Port conflict wrote configuration'
if answers | TEST_BUSY_DOCKER=1 bash "$repo/install.sh" --instance busy-udp > "$sandbox/output" 2>&1; then fail 'Accepted Docker-published UDP port'; fi
[[ ! -e /opt/amnezia-wg-ui-busy-udp/.env ]] || fail 'Docker conflict wrote configuration'
unchanged_old
echo 'PASS: TCP and Docker-published UDP conflicts stop before writing files'

# Default-instance update still uses the original directory and saved image.
printf 'y\n' | bash "$repo/install.sh" > "$sandbox/output" 2>&1 || fail 'Default update failed'
unchanged_old
echo 'PASS: default installation remains backward compatible'
echo 'Installer tests passed.'
