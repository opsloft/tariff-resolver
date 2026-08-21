# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
