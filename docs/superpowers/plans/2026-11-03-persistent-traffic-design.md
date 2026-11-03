# Persistent traffic and admin refinement

The user requested durable users/traffic and an Apple Design / Unslop review.
The subsequent direction is a matching red/pink accent and retained React Bits
effects. Implementation continues in the current checkout; the earlier
AWG/React changes are retained.

## Storage design

Use SQLite in the existing `/etc/wireguard` volume. Redis would add a separate
service without helping this single-server application. SQLite stores server
settings, complete client records and traffic cursors in transactions. Import
the current JSON once, preserving a backup. SQLite becomes authoritative;
`wg0.json` remains a compatibility snapshot and the portable backup format.

Accumulate receive/send totals using raw AWG counters. A Linux boot ID, network
namespace identity and interface index distinguish a recreated interface from
an unchanged interface. Convert legacy quota cursors to the lifetime domain.
Account counter decreases independently per direction. Collect every five seconds
without requiring an open browser, collect before removing a peer or shutting
down, and preserve totals when quotas reset. Backups/restores include totals.
An abrupt power failure may lose at most the interval since the last committed
sample; already lost historical counters cannot be reconstructed.

## Interface design

Use muted rose as the primary accent, secondary sky blue, cloud surfaces and
amber for warnings. Retain pointer-tracked SpotlightCard, first-entry CountUp
and AnimatedContent effects. Remove orbital artwork and repeated
navigation/context text. Use system typography with larger
readable secondary labels and tabular numbers. Make status, expiry, traffic and
actions easier to scan. Keep all management operations and both list/card views.

Use immediate press feedback and critically damped short springs for functional
transitions. Honor reduced motion, transparency and contrast preferences. Keep
native dialog focus, Escape and scroll behavior. Unslop is a writing skill;
apply it to labels and explanations rather than treating it as a UI library.

## Implementation and checks

- [x] Add SQLite repository tests for persistence, transactions, metadata,
  traffic reset/deduplication, peer removal and restore.
- [x] Integrate import, authoritative reads/writes, traffic collection, shutdown
  and cumulative API/metrics. Verify process/interface restart and quotas.
- [x] Refine UI typography/layout/copy/colors/motion without losing features.
- [x] Run backend tests/lint, React tests/build, Chromium desktop/mobile and
  actual Docker restart + tunnel checks. Update docs/screenshots and obtain an
  independent review. Do not deploy or publish.

Verified 2026-11-03: 174 backend tests passed (two Windows-specific skips),
24 frontend tests passed, lint passed, and three Chromium journeys passed.
The Docker build and real fresh/migrated AWG tunnel checks passed, including
restart and same-volume container replacement. Independent review fixes cover
network namespace reuse, compact-menu stacking, StrictMode animation replay and
legacy quota cursor conversion. Updated desktop/mobile screenshots use demo data.

Sources: the supplied `apple-design/SKILL.md`,
[Unslop](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md),
and the Node SQLite API. Storage and styling details are engineering choices
within the user's requested scope.
