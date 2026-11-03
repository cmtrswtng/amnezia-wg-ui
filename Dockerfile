# The published runtime targets linux/amd64.
FROM docker.io/library/node:24-alpine AS build_node_modules

# Copy Web UI
COPY src /app
WORKDIR /app
RUN npm ci --omit=dev &&\
    mv node_modules /node_modules

# Build the Web UI (Vite)
FROM docker.io/library/node:24-alpine AS build_ui

COPY src/www /ui
WORKDIR /ui
RUN npm ci && npm run build

# Copy build result to a new image.
# This saves a lot of disk space.
FROM amneziavpn/amneziawg-go:3.1.20260828 AS awg

FROM docker.io/library/node:24-alpine
COPY --from=awg /usr/bin/amneziawg-go /usr/bin/amneziawg-go
COPY --from=awg /usr/bin/awg /usr/bin/awg
COPY --from=awg /usr/bin/awg-quick /usr/bin/awg-quick
HEALTHCHECK --interval=1m --timeout=5s --retries=3 CMD /usr/bin/timeout 5s /bin/sh -c "/usr/bin/wg show wg0 >/dev/null 2>&1 || exit 1"
COPY --from=build_node_modules /app /app
COPY --from=build_ui /ui/dist /app/www/dist

# Move node_modules one directory up, so during development
# we don't have to mount it in a volume.
# This results in much faster reloading!
#
# Also, some node_modules might be native, and
# the architecture & OS of your development machine might differ
# than what runs inside of docker.
COPY --from=build_node_modules /node_modules /node_modules

# Copy the needed wg-password scripts
COPY --from=build_node_modules /app/wgpw.sh /bin/wgpw
RUN chmod +x /bin/wgpw

# Install Linux packages
RUN apk add --no-cache \
    dumb-init \
    iptables \
    iptables-legacy \
    iproute2 \
    bash

RUN ln -s /usr/bin/awg /usr/bin/wg && ln -s /usr/bin/awg-quick /usr/bin/wg-quick

# Use iptables-legacy
RUN ln -sf "$(command -v iptables-legacy)" "$(command -v iptables)" && \
    ln -sf "$(command -v iptables-legacy-restore)" "$(command -v iptables-restore)" && \
    ln -sf "$(command -v iptables-legacy-save)" "$(command -v iptables-save)"

# AWG wg-quick resolves interface names from this path; keep it aligned with
# the application's persisted configuration directory.
RUN mkdir -p /etc/amnezia /etc/wireguard && ln -s /etc/wireguard /etc/amnezia/amneziawg

# Set Environment
ENV DEBUG=Server,WireGuard

# Run Web UI
WORKDIR /app
CMD ["/usr/bin/dumb-init", "node", "server.js"]
