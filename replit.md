# BUCO TV

Una plataforma IPTV premium para ver TV en vivo desde el navegador, Android TV y celulares — estilo Netflix/DGO.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/buco-tv run dev` — run the BUCO TV frontend (port 23663)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: none (channels loaded from JSON file)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Video: hls.js (HLS streams via backend proxy)

## Where things live

- `artifacts/api-server/` — Express backend with channel API + stream proxy
- `artifacts/api-server/data/channels.json` — **source of truth for all channels** — edit here to add/remove channels
- `artifacts/buco-tv/` — React + Vite frontend (Netflix-style dark theme)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth for API)
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas (do not edit)

## Architecture decisions

- Stream proxy: frontend NEVER calls stream URLs directly. It calls `/stream/:id` → backend fetches and proxies the actual stream. This avoids Mixed Content and CORS issues.
- HLS proxy rewrites M3U8 manifests: segment URLs in `.m3u8` playlists are rewritten to go through `/proxy-segment?url=...` so the browser never touches external HTTP URLs.
- Channels from JSON: `data/channels.json` is loaded fresh on each request (no DB needed). Add a channel → it appears immediately without restart.
- Stream router is mounted at root `/` (not under `/api`) so `/stream/:id` is accessible directly.
- API routes are mounted under `/api` for consistency with OpenAPI spec.

## Product

- Home page: hero banner with featured channel, horizontal carousels by category
- TV en Vivo page: full channel grid with category filter tabs and search
- Player: fullscreen immersive player with HLS.js, floating controls (auto-hide after 3s), sliding channel guide, keyboard navigation (arrows, Enter, Escape, F)

## Adding / Editing Channels

Edit `artifacts/api-server/data/channels.json`. Each channel needs:
```json
{
  "id": 1,              // unique integer
  "name": "Canal Name",
  "category": "TV en Vivo",
  "logo": null,         // or "/path/to/logo.png"
  "stream": "https://..../index.m3u8",
  "featured": true,     // shows in hero / featured section
  "description": "Channel description"
}
```

## API Endpoints

- `GET /api/channels` — list all channels (supports `?category=` and `?featured=` filters)
- `GET /api/channels/:id` — get single channel
- `GET /api/channels/categories` — list all unique categories
- `GET /api/channels/featured` — list featured channels
- `GET /api/channels/stats` — channel count stats
- `GET /stream/:id` — proxy stream for a channel (HLS or direct)
- `GET /proxy-segment?url=...` — proxy individual HLS segments

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After editing channels.json, no restart needed — loaded fresh per request.
- `process.cwd()` is used in routes to resolve `data/channels.json` (not `import.meta.url`) because esbuild bundles everything into `dist/` and relative paths from source don't survive bundling.
- The stream router must be mounted BEFORE the `/api` router in `app.ts` to avoid path conflicts.
- After any OpenAPI spec change, always run `pnpm --filter @workspace/api-spec run codegen`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
