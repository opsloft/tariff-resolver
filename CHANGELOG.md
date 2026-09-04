# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-09-04

### Added

- Pure core (`tariff-resolver/core`): `buildDataset`, `resolveDuty`, `normalizeOrigin`, `citedPrefixes`, `findOverride` — no Node APIs, runs in edge runtimes. This is the layer behind the hosted REST endpoint.
- Per-layer `match` (`footnote` / `origin_name` / `universal`) and `confidence` (`enumerated` / `heuristic` / `unknown`).
- `possibly_expired`: layers whose heading matches a sourced entry in `data/status_overrides.json` are returned separately with `status`, `reason`, `source`, `as_of`.
- Chapter filter: headings that cite other subheadings/chapters are dropped from lines they cannot apply to; the count is reported in `excluded.chapter_mismatch`.
- Origins accept ISO-3166 alpha-2 codes.
- `fees_usd` (separate MPF/HMF, `fee_year`) on every result; MPF figures labelled FY2026.
- `data/status_overrides.json`: 36 sourced entries (IEEPA headings ended per CBP CSMS #67834313, effective 2026-02-24; Section 122 headings 9903.03.01–.11 expired 2026-07-24 per CSMS #67844987).

### Changed

- `calculate_tariff_scenario` now returns the core result plus all 1.0.x fields (additive; existing clients keep working).
- USITC HTS snapshot refreshed 2026-08-18 → 2026-09-04 (35,804 rows, 3,111 Chapter 99 rules; adds headings 9903.03.12–9903.03.16 that were missing from the earlier snapshot).

## [1.0.3] — 2026-08-25

Correctness release. A public worked example (a synthetic hoodie, 6110.30.30 from China) showed that naively totalling every Chapter 99 heading the schedule prints returns a rate far above what an entry is actually assessed at. Two causes, both now addressed.

### Fixed

- **Suspended provisions were treated as live.** The dead-heading filter only matched "provision terminated" / "no longer in effect" / "provision has expired". Headings marked "provision suspended", "provision was terminated on …", or "expired at the close of …" slipped through — including one carrying a 34% adder. All four wordings are now filtered.

### Added

- `compiler_note` on every Chapter 99 rule that carries one, so the model sees the USITC's own annotation verbatim instead of only the rate.
- `stacking_warning` and `schedule_snapshot_date` on every `calculate_tariff_scenario` result: the schedule is wrong in **both** directions — provisions whose collection has stopped keep printing with no end date (IEEPA and Section 122 headings are the recurring case), and newly proclaimed actions land in the schedule days after they take effect. The model is told not to total the layers blindly, to report which layers it applied and which it dropped, and to verify collection status against CBP CSMS.

## [1.0.2] — 2026-08-21

### Changed

- **All user-facing text is now English**: tool titles, descriptions, input schema docs, result messages, and revision-diff markers ("(new line)" / "(line removed)"). Earlier versions mixed Vietnamese into tool output.
- Tool annotations added for every tool (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) per MCP directory review standards.

### Added

- Privacy policy: section in README and https://opsloft.dev/privacy (the server runs fully local and collects nothing).
- Claude Desktop one-click install: `.mcpb` bundle build (`scripts/build_mcpb.sh`, manifest in `mcpb/`), attached to GitHub Releases.

## [1.0.1] — 2026-08-21

### Changed

- Registry metadata enriched: `server.json` now declares `repository` (with stable GitHub repo ID) and `websiteUrl`, per MCP Registry schema recommendations for transparency and security inspection.
- npm README for this version picks up the demo GIF, copy fixes, and the current badge row (frozen per-version on npm).

No functional changes — tool surface and outputs identical to 1.0.0.

## [1.0.0] — 2026-08-20

First stable release. The tool surface (5 tools) and output shapes are now covered by semver: breaking changes to tool names, input schemas, or result fields will bump the major version.

### Added

- CI workflow (build + stdio smoke test on Node 18/20/22).
- `engines` field (Node ≥ 18) in package metadata.
- Test suite (19 tests, `node:test`): data layer on a hand-built fixture (hierarchy paths, rate inheritance, Chapter 99 matching, rate parsing, watchlist, revision diff) plus a full MCP stdio round-trip calling every tool. Coverage measured with `c8` and CI-enforced at ≥95% lines / ≥95% functions.

### Unchanged from 0.1.x

- 5 tools: `search_hs_candidates`, `calculate_tariff_scenario`, `watch_tariff_changes`, `check_tariff_updates`, `dataset_info`.
- USITC HTS dataset (35,000+ tariff lines, US Government public domain).

## [0.1.1] — 2026-08-20

### Added

- `mcpName` field for MCP Registry ownership validation.
- Demo GIF in README.

## [0.1.0] — 2026-08-20

Initial public release.
