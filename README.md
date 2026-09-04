# tariff-resolver

[![npm version](https://img.shields.io/npm/v/tariff-resolver)](https://www.npmjs.com/package/tariff-resolver)
[![CI](https://github.com/opsloft/tariff-resolver/actions/workflows/ci.yml/badge.svg)](https://github.com/opsloft/tariff-resolver/actions/workflows/ci.yml)
[![coverage: ≥95% lines, CI-enforced](https://img.shields.io/badge/coverage-%E2%89%A595%25_lines-brightgreen)](https://github.com/opsloft/tariff-resolver/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/tariff-resolver)](https://www.npmjs.com/package/tariff-resolver)
[![node](https://img.shields.io/node/v/tariff-resolver)](https://www.npmjs.com/package/tariff-resolver)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.opsloft%2Ftariff--resolver-6366f1)](https://registry.modelcontextprotocol.io/v0/servers?search=tariff-resolver)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

An MCP server that turns your AI assistant into a **US import duty research tool** — built on official USITC Harmonized Tariff Schedule data (US Government public domain, 35,000+ tariff lines).

- 🔍 **HTS code candidates** from plain product descriptions, with CBP CROSS ruling links
- 🧮 **Landed-cost components**: MFN/FTA base rates + Chapter 99 additional duties (IEEPA / Section 301 / 232) + MPF/HMF fees
- 📡 **Tariff change tracking**: watchlist your HTS codes, diff rates between HTS revisions
- 🤖 **AI-optimized, hallucination-resistant**: returns the *actual* Chapter 99 rule text with parsed rates, so your LLM reasons over real exception chains instead of inventing 2024-era numbers

![Demo: resolving duties for a vacuum flask from China, then switching product and origin — the full Chapter 99 stack recalculates live](./docs/demo.gif)

Why now: since the de minimis exemption ended (Aug 29, 2025), **every US-bound shipment needs an HTS code and duty payment** — and 2025–26 rates keep changing by executive order.

**Not affiliated with any government agency. Outputs are candidates/estimates for pre-broker screening — not customs, legal, or tax advice. Estimates exclude AD/CVD duties.**

## Install

Requires Node.js ≥ 18.

```bash
claude mcp add tariff-resolver -- npx -y tariff-resolver
```

Or in any MCP client config:

```json
{ "mcpServers": { "tariff-resolver": { "command": "npx", "args": ["-y", "tariff-resolver"] } } }
```

**Claude Desktop (one-click):** download `tariff-resolver-<version>.mcpb` from [Releases](https://github.com/opsloft/tariff-resolver/releases) and double-click it — no terminal needed.

## 💡 Try these prompts

- **Basic search:** *"Find the HTS code for a men's 100% cotton t-shirt."*
- **Full scenario:** *"Calculate the tariff scenario for HTS 6109.10.00, origin China, customs value $5,000, ocean freight."*
- **Sourcing decision:** *"I'm importing $10k of stainless steel vacuum flasks. Compare landed cost if I source from China vs Vietnam."*
- **Stay current:** *"Watch tariff changes for my catalog: 6109.10.00, 8507.60.00, 9617.00.10."*

## Tools

| Tool | What it does |
|---|---|
| `search_hs_candidates` | Product description → top HTS candidates with rates + CBP CROSS ruling links |
| `calculate_tariff_scenario` | HTS code + origin + value (+ weight) → structured JSON: base MFN/FTA rate, candidate Chapter 99 layers with per-layer match/confidence, sourced possibly_expired bucket, MPF/HMF |
| `watch_tariff_changes` | Register HTS codes to a local watchlist |
| `check_tariff_updates` | Diff current vs previous HTS revision — see exactly which rates changed |
| `dataset_info` | Data revision date, row counts, source, license |

## Design

The server does the **retrieval**; your LLM does the reasoning. Chapter 99 rules are returned verbatim (with parsed `adder_pct` where applicable) so the model reads the actual exception chains instead of trusting a black-box calculation. Rates for 10-digit statistical suffixes inherit from their parent rate line. Headings the schedule marks as dead — terminated, suspended, expired — are filtered out and counted, and the USITC's own `compiler_note` rides along with any rule that carries one.

**Status overrides.** `data/status_overrides.json` is a short, sourced list of Chapter 99 headings whose collection has stopped, expired, or been suspended even though the schedule still prints them. A layer matching an entry is returned under `possibly_expired` with the entry's `status`, `reason`, `source` URL and `as_of` date instead of in `layers`. Every entry carries a CBP, Federal Register or USITC source; pull requests adding entries must include one.

**What the data cannot tell you.** The published schedule is wrong in both directions at any given moment, so every result carries a `stacking_warning` and the snapshot date. Provisions whose collection has already stopped keep printing with no end date — IEEPA and Section 122 headings are the recurring case — and newly proclaimed actions appear in the schedule days after they take effect. Totalling every layer the schedule prints yields a rate nobody is charged. Treat the layers as candidates, and verify collection status against [CBP CSMS messages](https://content.govdelivery.com/accounts/USDHSCBP/bulletins) before relying on a stack.

**One core, two front doors.** All duty logic lives in `tariff-resolver/core` (pure TypeScript, no filesystem or network): `resolveDuty(dataset, { hts, origin, value_usd?, ocean? })` — `origin` takes an ISO-3166 alpha-2 code or an English country name — returns the base line, separate MPF/HMF, every candidate Chapter 99 layer with `match` and `confidence`, a sourced `possibly_expired` bucket, and the snapshot date. The MCP tool calls it; so can any Node or edge runtime.

## Data

Ships with a full HTS snapshot, fetched from USITC's official JSON API (US Government public domain). Refresh anytime:

```bash
python3 scripts/fetch_hts.py   # ~2 min, fails hard rather than write a partial dataset
```

`dataset_info` reports the revision date your queries run against.

## Privacy Policy

tariff-resolver runs entirely on your machine and collects nothing:

- **Data collection**: none. No queries, telemetry, analytics, or usage data are collected or transmitted.
- **Usage and storage**: your watchlist is stored in a local JSON file on your machine; all lookups run against the bundled local dataset.
- **Third-party sharing**: none. The server makes no network requests at runtime. (The optional `scripts/fetch_hts.py` refresh script contacts only the official USITC API.)
- **Data retention**: nothing to retain — delete the local watchlist file at any time.
- **Contact**: tom@opsloft.dev

Full policy: <https://opsloft.dev/privacy>

## License

MIT. Tariff data is a work of the US Government (public domain).
