# As a workaround we have to build on nodejs 18
# nodejs 20 hangs on build with armv6/armv7
FROM docker.io/library/node:18-alpine AS build_node_modules

# Copy Web UI
COPY src /app
WORKDIR /app
RUN npm ci --omit=dev &&\
    mv node_modules /node_modules

# Build the Web UI (Vite)
FROM docker.io/library/node:18-alpine AS build_ui

COPY src/www /ui
WORKDIR /ui
RUN npm ci && npm run build

# Copy build result to a new image.
# This saves a lot of disk space.
FROM amneziavpn/amneziawg-go:2.0.0
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
    dpkg \
    dumb-init \
    iptables \
    iptables-legacy \
    nodejs \
    npm

# Use iptables-legacy
RUN update-alternatives --install /sbin/iptables iptables /sbin/iptables-legacy 10 --slave /sbin/iptables-restore iptables-restore /sbin/iptables-legacy-restore --slave /sbin/iptables-save iptables-save /sbin/iptables-legacy-save

# AWG 2 wg-quick resolves interface names from this path; keep it aligned with
# the application's persisted configuration directory.
RUN mkdir -p /etc/amnezia && ln -s /etc/wireguard /etc/amnezia/amneziawg

# Set Environment
ENV DEBUG=Server,WireGuard

# Run Web UI
WORKDIR /app
CMD ["/usr/bin/dumb-init", "node", "server.js"]
