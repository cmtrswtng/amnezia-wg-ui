#!/usr/bin/env bash
set -euo pipefail
# Isolated containers/network only. No production volume and no published ports.
image="${1:-amnezia-wg-ui:awg31-review}"
prefix="awg31-check-$$"
network="${prefix}-net"
server="${prefix}-server"
client="${prefix}-client"
fresh_volume="${prefix}-fresh-data"
migrated_volume="${prefix}-migrated-data"
restored_volume="${prefix}-restored-data"
cleanup() {
  docker rm -f "$client" "$server" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker volume rm "$fresh_volume" "$migrated_volume" "$restored_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$network" >/dev/null
start_server() {
  local subnet=10.8.0.x vpn_port=51820
  if [[ "$mode" == restored ]]; then subnet=10.9.0.x; vpn_port=51822; fi
  docker run -d --name "$server" --network "$network" --network-alias awg31-server \
    --mount "type=volume,source=${prefix}-${mode}-data,target=/etc/wireguard" \
    --cap-add NET_ADMIN --device /dev/net/tun --sysctl net.ipv4.ip_forward=1 \
    -e WG_HOST=awg31-server -e WG_DEFAULT_ADDRESS="$subnet" -e WG_PORT="$vpn_port" \
    -e SMOKE_SEED_AWG2="$mode" --entrypoint sh "$image" \
    -c 'node scripts/seed-awg2-smoke.js && exec /usr/bin/dumb-init node server.js' >/dev/null
}
for mode in fresh migrated restored; do
  echo "Checking AWG 3.1: ${mode} installation"
  start_server
  if ! docker exec "$server" node scripts/prepare-awg31-smoke.js; then
    docker logs "$server"
    exit 1
  fi
  docker exec "$server" cat /tmp/awg31-client.conf | \
    docker run --rm -i --name "$client" --network "$network" --cap-add NET_ADMIN \
      --device /dev/net/tun --entrypoint node "$image" scripts/check-awg31-client.js
  docker exec "$server" node scripts/check-persistence-smoke.js before
  docker restart "$server" >/dev/null
  docker exec "$server" node scripts/check-persistence-smoke.js after
  docker rm -f "$server" >/dev/null
  start_server
  docker exec "$server" node scripts/check-persistence-smoke.js after
  docker rm -f "$server" >/dev/null
done
echo 'AWG 3.1 fresh, migrated and cross-subnet restore smoke tests passed.'
