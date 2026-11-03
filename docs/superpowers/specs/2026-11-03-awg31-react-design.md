# AmneziaWG 3.1, reliable client profiles, and React admin

Status: approved by the user on 2026-11-03. The user selected one IPv4 profile
for all operating systems on 2026-11-03. Other implementation choices below are
engineering proposals, not additional requirements attributed to the user.

## Intent

Upgrade the VPN to AmneziaWG 3.1, eliminate repeated IPv6/DNS edits to downloaded
profiles, and replace the Vue admin with a clear, distinctive React interface.
Keep existing client records, keys, quotas, expiry dates, tags, and admin tools.

## Evidence from this checkout

- `Dockerfile` uses `amneziavpn/amneziawg-go:2.0.0`.
- `src/lib/awgConfig.js` accepts persisted protocol version `2` and renders only
  AWG 2 fields. Changing the image alone would leave the new mechanisms unused.
- `src/config.js` defaults to `AllowedIPs = 0.0.0.0/0, ::/0`, but server addresses,
  peer addresses, forwarding, NAT, and Compose sysctls configure only IPv4.
  This is a concrete routing mismatch; its contribution to each device's symptoms
  still needs real-device verification.
- The current local environment explicitly sets the same dual-stack route and
  Cloudflare DNS. Updating code defaults alone would not change that deployment.
- Downloads, QR codes, and one-time links ultimately use the same profile
  generator, so the networking change belongs there.
- The frontend is Vue 3, Vite 5, Tailwind 3, vue-i18n, and ApexCharts. It already
  has name search, status/tag filters, quotas, expiry, bulk actions, a dashboard,
  audit history, backup/restore, optional links, and translations.
- The current green indicator means enabled, not a recent handshake.

## Approaches

1. **One shared IPv4 profile, React/Vite frontend, retained backend.** Selected
   networking approach. Matches the actual IPv4 server and requires no platform
   choice when downloading. Retaining the management API limits migration risk.
2. **Separate network presets at export.** Discussed and not selected. Allows
   exceptions but introduces a choice and testing combinations for every export.

React is explicitly requested. A new backend framework or a second VPN interface
would add migration work without helping the requested admin redesign, so neither
is proposed.

## AmneziaWG runtime and persistence

Use the published versioned `amneziavpn/amneziawg-go:3.1.20260828` image, subject
to image inspection and the interface smoke test. Retain `linux/amd64`, the
existing volume location, and the image's `wg`/`wg-quick` compatibility commands.
Use a current Node LTS image for the frontend build/dev services; verify the
runtime Node version supplied by the final Alpine package rather than assuming
the builder controls it.

Introduce persisted `protocolVersion: "3.1"`. Accept the existing version-2
schema and the unversioned legacy schema through explicit migration paths. An
unknown version or malformed file is an error, never a fresh installation.

Migration validates the source, prepares the complete target in memory, and
creates a version-specific, exclusive, mode-0600 backup of the original JSON
before replacing it. Existing backups are never overwritten. Retain all server
and client identity keys and metadata. Obfuscation settings change deliberately;
all client profiles must be downloaded and imported again. Repeated startup must
retain the exact new settings and header key, irrespective of later env changes.
Backup/restore must use the same validation/migration path. Describe restoration
of both the old image and its matching data in the rollback instructions.

Add a shared validator/renderer for the 3.1 fields. The same persisted header key
and shared framing must appear in the server and every exported client profile.
Keep secrets out of logs, errors, public settings, and screenshots.

The initial proposed preset uses header protection with a cryptographically
random 32-byte base64 `HeaderProtectionKey`; equal, randomized `S1`–`S4` of at
least 12 bytes; the documented compatibility `H1`–`H4` values `1`, `2`, `3`, `4`;
bounded content padding; and supported randomized timing ranges. Support
`RandomTrailers` and `DisableCookies` with explicit boolean validation. Keep
cookie protection enabled by default. Exact content-padding/timing defaults are
left to the implementer, who must check the pinned source and real CLI parser.
The preset must satisfy its MTU budget. Keep `I1`–`I5` optional rather than
inventing a universal signature for the user's network.

Validate integer bounds, ordered ranges, header-range collisions, base64 key
length, padding prerequisites, newline injection, and relevant timing
relationships. Test the values against the actual pinned AWG tools, including
`wg show ... dump` parsing: the upgraded tools may change their output shape.

## Shared IPv4 export

Proposed defaults:

| Setting | Value |
| --- | --- |
| Allowed IPs | `0.0.0.0/0` |
| DNS | `77.88.8.8, 77.88.8.1` (Yandex basic) |
| Client MTU | `1280` |
| Persistent keepalive | a supported NAT-friendly value/range around 25 seconds |

Keep intentional environment overrides, including an explicitly empty DNS.
Update `.env.example`, installer defaults, README, and only the relevant network
keys in the existing local `.env`; do not display or replace its password or
other settings. Existing remote installations require a single server-side env
update and restart, then redistribution of newly exported profiles, not manual
editing of each profile. Document the exact commands/values.

All export paths must be byte-consistent in their network settings. A plain
WireGuard client or an old AWG client is not a supported way to import a 3.1
profile. Follow the official minimum AmneziaVPN version guidance and separately
check native AmneziaWG clients for 3.1 support.

IPv4-only routing does not tunnel native IPv6. Full IPv6 routing or a device-side
IPv6 kill switch is outside this change. DNS changes do not fix absent handshakes,
and MTU changes do not guarantee access through an arbitrary blocked network.

## React application

Use the latest stable React and matching React DOM available at implementation
time, with Vite and JavaScript modules. Verify the package registry before
pinning versions. Keep the existing API helper and reusable formatting functions.
Replace Vue composables with focused React hooks/providers for auth, settings,
clients/polling, translations, and toasts. Avoid one giant application component.
Remove Vue and its build plugin after feature parity is verified.

Preserve the existing translation catalogue and saved language preference,
remember-me behavior, unauthenticated deployments, 401 handling, and logout.
Keep polling at five seconds with cleanup, no duplicate timers, no overlapping
requests, no stale data rendered after logout, and an explicit retry state.
Retain the optional chart modes and avatars. Avoid shipping the chart library in
the login bundle; lazy-load it or use equivalent lightweight chart components.

### Appearance and information hierarchy

- Cloud-white page (`#F7FAFD`), white cards, sky-blue surfaces (`#E0F2FE`), primary
  blue (`#0284C7`), dark blue-gray text (`#142B40`), red accents (`#E30613`, a
  proposed MTS-like red rather than a claim of using MTS brand assets).
- Spacious header and compact navigation for clients, overview, and audit.
- Overview numbers show clients, recent handshakes, upcoming expiry, and traffic.
  An enabled client is never presented as online solely because it is enabled.
- Client cards prioritize name, IP with copy action, access state, recent
  handshake, remaining access, quota progress, and transferred data. QR and
  download remain easy to reach; edit/reset/delete go into a clear actions menu.
- A prominent search bar matches name, IPv4 address, and tags, ignoring case.
  Combine it with existing tags/access filters and new online/offline and
  expiring-soon filters. Add sorting by name, recent handshake, traffic, expiry.
- Offer card and compact-list views with a saved view preference, a result count,
  clear-filters action, and distinct empty/loading/failure states.
- Keep create/edit forms, bulk selection and actions, renewal, quota reset,
  backup/restore, audit, one-time links, and all current optional behavior.
- Use local React Bits components selectively: Spotlight Card for subtle pointer
  lighting, Count Up for initial overview numbers, and Animated Content for first
  entry. Include source/license attribution. No animation replay on every poll.
- Keyboard navigation, visible focus, labeled controls, dialog focus trapping
  and restoration, Escape handling, reduced-motion support, readable contrast,
  and mobile layouts from 360px are part of the implementation.

These layout, feature, and color details are proposals based on the user's
requested palette and permission to add useful features.

## Verification and release evidence

Baseline on 2026-11-03: 118 backend tests pass, 2 platform-specific tests skip;
backend lint and the existing Vue production build pass. Windows sandbox TEMP
caused atomic-rename EPERM failures; rerunning with TEMP/TMP inside the ignored
`src/node_modules/.tmp-awg-baseline` directory passes. This is environment
evidence, not a product-code fix.

The local Docker daemon currently rejects access from the sandbox. Do not call
an image validated until its build and privileged interface smoke test actually
run. Request the normal sandbox escalation if needed for that bounded check.

Required automated coverage: migration from legacy and v2, idempotence,
preservation of keys/metadata, backup failures, invalid/unsupported state,
matching server/export fields, DNS/route/MTU settings and overrides, all export
paths, and actual CLI acceptance. Keep the existing quota/client/audit tests.
Add focused React tests for search/filter combinations, real handshake state,
session/poll cleanup, and critical forms/actions. Verify production build and
browser journeys on desktop and narrow/mobile layouts.

Update the existing CI smoke test for 3.1 and validate a fresh and migrated
interface before image publishing. A local change does not authorize triggering
a remote release or changing the user's running VPN server.

Manual acceptance on Windows, Android, Linux, macOS, and iOS requires a newly
imported profile, a fresh handshake, bidirectional counters, IPv4 browsing, DNS,
and stable large transfers on Wi-Fi and a mobile network where available.
Record unavailable device checks honestly; neither unit tests nor a green toggle
prove cross-platform VPN connectivity.

## Sources checked on 2026-11-03

- [AmneziaWG 3.1 release and client/update instructions](https://amnezia.org/ru/blog/amneziawg-3-1-is-here)
- [Official protocol parameters and compatibility guidance](https://docs.amnezia.org/documentation/amnezia-wg/)
- [Pinned Go implementation README](https://github.com/amnezia-vpn/amneziawg-go/blob/v3.1.20260828/README.md)
- [Published image tags](https://hub.docker.com/r/amneziavpn/amneziawg-go/tags)
- [Pinned runtime Dockerfile](https://github.com/amnezia-vpn/amneziawg-go/blob/v3.1.20260828/Dockerfile)
- [Official AWG configuration parser](https://github.com/amnezia-vpn/amneziawg-tools/blob/master/src/config.c)
- [React releases](https://github.com/react/react/releases)
- [React Bits Spotlight Card](https://reactbits.dev/components/spotlight-card)
- [Yandex DNS](https://dns.yandex.ru/)
