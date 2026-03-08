# OpBit Terminal (Next.js)

OpBit is a Bloomberg-style options terminal for comparing quotes, volatility, and strategy context across multiple venues.

## Current data status

| Venue | Status | Source |
| --- | --- | --- |
| Deribit | Live | Deribit public API |
| Aevo | Live | Aevo public API (`/markets`, `/orderbook`) |
| Lyra v2 | Live (when enabled) | Lyra public API |
| Panoptic | Live liquidity view (when enabled + subgraph set) | Subgraph data |
| IBIT | Live (when enabled) | Yahoo options chain adapter |

Notes:
- Aevo is not mock-mode. If orderbook levels are missing for some contracts, OpBit uses mark-based fallback for those rows.
- Panoptic is liquidity-first data (`LIQUIDITY_ONLY`) and does not behave like a centralized orderbook venue.

## App routes

| Route | Description |
| --- | --- |
| `/terminal` | Main terminal (desktop + mobile UI) |
| `/methodology` | Matching, standardization, and metrics notes |

## API routes

### Options
- `GET /api/options/health`
- `GET /api/options/venues`
- `GET /api/options/instruments?underlying=BTC&venues=DERIBIT,AEVO,LYRA_V2`
- `GET /api/options/chain?underlying=BTC&expiry=2026-03-09&venues=DERIBIT,AEVO`
- `GET /api/options/compare?underlying=BTC&expiry=2026-03-09&venues=DERIBIT,AEVO&benchmark=DERIBIT`
- `GET /api/options/best?underlying=BTC&expiry=2026-03-09&venues=DERIBIT,AEVO,LYRA_V2`
- `GET /api/options/fair-best?...`
- `GET /api/options/panoptic-liquidity?underlying=ETH`

### Market and assistant
- `GET /api/market/spot?symbols=BTC,ETH,IBIT`
- `GET /api/market/ticker`
- `GET /api/market/news?underlying=BTC`
- `POST /api/assistant`
- `GET /api/arb?...`
- `GET /api/stream/status`

## Local development

```bash
npm install
npm run dev
```

Then open:
- `http://localhost:3000/terminal`

Other scripts:

```bash
npm run lint
npm run build
npm run start
```

## Environment variables

Copy `.env.example` to `.env.local` and set what you need.

### Venue toggles and backends
- `LYRA_ENABLED=true|false`
- `LYRA_API_BASE=https://api.lyra.finance`
- `PANOPTIC_ENABLED=true|false`
- `PANOPTIC_SUBGRAPH_URL=...`
- `PANOPTIC_NETWORK=sepolia|mainnet`
- `IBIT_ENABLED=true|false`

### News
- `NEWSAPI_KEY=...` (optional; without it, app uses free crypto feed fallback)
- `FINNHUB_TOKEN=...` (optional)
- `NEWS_CACHE_TTL_MS=60000`

### Assistant (server-side only)
- `GEMINI_API_KEY=...`
- `GEMINI_API_KEY_BACKUP=...`
- `OPENROUTER_API_KEY_BACKUP=...`

### Cache
- `SPOT_CACHE_TTL_MS=2000`
- `TICKER_CACHE_TTL_MS=5000`

## Vercel deployment

Set preset to `Next.js`, root directory `./`, then add env vars from `.env.local` (or import `.env`).

Recommended:
1. Add required env vars for features you want enabled.
2. Deploy.
3. Verify `/terminal` and `/api/options/health`.

## Keyboard shortcuts (desktop)

- `Up` / `Down`: move strike selection
- `Left` / `Right`: switch side
- `Enter`: open/lock selected contract context
- `Esc`: close or unlock
- `/`: open command palette
- `R`: refresh market data

