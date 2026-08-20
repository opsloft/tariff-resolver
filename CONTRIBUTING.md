# Contributing

Thanks for your interest in improving tariff-resolver!

## Bugs & feature requests

Open an issue at <https://github.com/opsloft/tariff-resolver/issues>. For rate discrepancies, please include the HTS number, origin country, and the [hts.usitc.gov](https://hts.usitc.gov) revision you compared against — that makes verification fast.

## Development

```bash
npm ci
npm run build     # tsc → dist/
npm start         # run the MCP server on stdio
```

The stdio smoke test that CI runs is in `.github/workflows/ci.yml` — please make sure it passes before opening a PR.

## Data updates

The HTS dataset is fetched from the official USITC export with `scripts/fetch_hts.py`. Do not hand-edit `data/hts_full.json`.

## Scope

This project deliberately stays small: US import duty research from official public-domain data, exposed through MCP. Estimates exclude AD/CVD; outputs are not customs, legal or tax advice.
