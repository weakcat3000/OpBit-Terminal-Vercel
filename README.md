# Bloomberg DeFi Options Terminal

A Bloomberg-style terminal for comparing DeFi options across venues: **Deribit** (real), **Aevo** (mock mode), and scaffolded adapters for **Lyra v2**, **Panoptic**, and **IBIT**.

## Quick Start

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build
npm run lint      # ESLint check
```

## Routes

| Route | Description |
|-------|-------------|
| `/terminal` | Main options terminal (3-pane Bloomberg-style UI) |
| `/methodology` | Explanation of matching and metrics |

## API Endpoints

| Endpoint | Example |
|----------|---------|
| `GET /api/options/health` | Returns venue statuses |
| `GET /api/options/instruments?underlying=ETH&venues=DERIBIT,AEVO` | Available expiries + strike ranges |
| `GET /api/options/chain?underlying=ETH&expiry=2026-03-29&venues=DERIBIT` | Normalized + matched options for an expiry |
| `GET /api/options/compare?underlying=ETH&expiry=2026-03-29&venues=DERIBIT,AEVO&benchmark=DERIBIT` | Matched contracts with metrics + UI rows |

## Keyboard Controls

| Key | Action |
|-----|--------|
| â†‘/â†“ | Navigate strikes |
| â†/â†’ | Switch Call/Put |
| Enter | Lock selection (inspector) |
| Esc | Unlock |
| / | Open command palette |
| R | Refresh data |

## Venue Status

| Venue | Status | Notes |
|-------|--------|-------|
| **Deribit** | âœ… Real | Public API, no auth required |
| **Aevo** | âš ï¸ Mock | `AEVO_MOCK_MODE=true` (default). Set to `false` to enable real API (not yet wired) |
| **Lyra v2** | ðŸ”² Scaffolded | Needs SDK/indexer integration |
| **Panoptic** | ðŸ”² Scaffolded | Needs subgraph endpoint |
| **IBIT** | ðŸ”² Scaffolded | Needs TradFi options feed |

## Architecture

```
src/
  core/types/      # NormalizedOption, Venue, ComparisonMetrics
  core/utils/      # http, cache, time, numbers
  data/adapters/   # Per-venue adapters (deribit, aevo, lyraV2, panoptic, ibit)
  normalize/       # Raw â†’ NormalizedOption conversion
  match/           # Cross-venue contract matching
  metrics/         # Spread, vsBenchmark, IV gap computation
  services/        # optionsService (sole orchestration point)
  app/api/options/ # Next.js API route handlers
  app/terminal/    # Terminal page
  app/methodology/ # Methodology page
components/
  ui/              # Panel, SplitPane, Table, Pill
  terminal/        # TopBar, OptionsChainGrid, ContractInspector, etc.
```

## Next Steps

1. **Wire Aevo real API**: Set `AEVO_MOCK_MODE=false`, implement REST/WS calls in `src/data/adapters/aevo.ts`
2. **Wire Lyra v2**: Add Lyra SDK, implement `listInstruments` / `getQuotes` in `lyraV2.ts`
3. **Wire Panoptic**: Build subgraph queries using `subgraph-query-builder` skill
4. **Wire IBIT**: Integrate TradFi options feed (CBOE DataShop, IEX Cloud, etc.)
5. **WebSocket streaming**: Implement `subscribeQuotes` for real-time updates

