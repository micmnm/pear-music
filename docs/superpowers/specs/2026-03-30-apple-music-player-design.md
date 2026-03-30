# Apple Music Player — MVP Design Spec

## Overview

A single-page web app for playing curated Apple Music albums and playlists. The user maintains a library by pasting Apple Music URLs. A shuffle button picks a random entry and plays it via Apple's embedded player. Single-user, no auth.

## Stack

- **Frontend:** Vite + vanilla TypeScript
- **Backend:** Express + TypeScript
- **Data:** JSON file on disk
- **Playback:** Apple Music embed player (iframe)
- **Future upgrade path:** MusicKit JS for full playback control (requires Apple Developer account), Supabase for multi-user

## Architecture

### Project Structure

```
src/
  client/
    main.ts        — app entry, initializes UI
    player.ts      — manage Apple Music embed iframe
    shuffle.ts     — call shuffle API, update UI
    ui.ts          — DOM manipulation
    types.ts       — shared interfaces
  server/
    index.ts       — Express server entry, serves static frontend
    routes.ts      — API endpoint handlers
    apple.ts       — Apple Music URL parsing, metadata fetching
data/
  library.json     — curated album/playlist list
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/library` | Returns all entries from `library.json` |
| `POST` | `/api/library` | Accepts `{ url: string }`, parses Apple Music URL, fetches metadata, appends to `library.json`, returns new entry |
| `DELETE` | `/api/library/:id` | Removes an entry by ID |
| `GET` | `/api/shuffle` | Returns one random entry from `library.json` |

### Data Model

`data/library.json`:

```json
{
  "items": [
    {
      "id": "1109714933",
      "type": "album",
      "name": "In Rainbows",
      "artistName": "Radiohead",
      "artworkUrl": "https://is1-ssl.mzstatic.com/image/...",
      "url": "https://music.apple.com/us/album/in-rainbows/1109714933"
    },
    {
      "id": "pl.abc123",
      "type": "playlist",
      "name": "Chill Vibes",
      "artistName": null,
      "artworkUrl": "https://is1-ssl.mzstatic.com/image/...",
      "url": "https://music.apple.com/us/playlist/chill-vibes/pl.abc123"
    }
  ]
}
```

Fields:
- `id` — Apple Music catalog ID (extracted from URL)
- `type` — `"album"` or `"playlist"`
- `name` — album or playlist title
- `artistName` — artist name (null for playlists)
- `artworkUrl` — cover art URL from Apple's CDN
- `url` — original Apple Music URL

## Frontend

### UI Layout

Single centered view, top to bottom:

1. **Album artwork** — large, dominant, loaded from `artworkUrl` in metadata
2. **Title + artist** — album/playlist name, artist (if album)
3. **Apple Music embed player** — iframe, handles playback controls and Apple Music auth
4. **Shuffle button** — prominent, always visible. Calls `GET /api/shuffle`, updates display and swaps iframe
5. **Add button (`+`)** — small, in corner. Opens a minimal input field to paste an Apple Music URL. Calls `POST /api/library`

### Embed Player

The iframe source follows this pattern:
```
https://embed.music.apple.com/{country}/{type}/{slug}/{id}
```

Apple's embed handles:
- Play/pause/skip controls
- User authentication (Apple Music subscription)
- 30-second previews for non-subscribers

### Interactions

- **On load:** Call `GET /api/library`. If library is empty, show a prompt to add the first album. If library has items, auto-shuffle and start playing.
- **Shuffle:** Call `GET /api/shuffle`, update artwork/title/artist, swap iframe `src`.
- **Add:** Open input overlay, paste URL, submit. Call `POST /api/library`. On success, show brief confirmation and add to local list. On error, show message (invalid URL, fetch failed).
- **Delete:** Not exposed in UI for MVP. Use `DELETE` API directly or edit `library.json`.

## Backend

### Express Server (`src/server/index.ts`)

- Serves Vite-built static files from `dist/client/`
- Mounts API routes under `/api`
- Reads/writes `data/library.json` on disk

### URL Parsing (`src/server/apple.ts`)

Parses Apple Music URLs to extract:
- `type`: album or playlist (from URL path segment)
- `id`: catalog ID (last path segment, or after `pl.` for playlists)

Fetches metadata by scraping Open Graph meta tags from the Apple Music URL page. This is publicly accessible (no developer token needed) and provides title, artist, and artwork URL. If Apple changes the OG tag format, this is the only part that needs updating.

### Shuffle Logic (`routes.ts`)

Simple random pick from the items array. No repeat-avoidance or weighting for MVP.

## Development Setup

- `npm run dev` — runs Vite dev server (frontend) and Express (backend) concurrently
- `npm run build` — builds frontend with Vite, compiles server with tsc
- `npm run start` — runs the production Express server serving static files

## Upgrade Path

### MusicKit JS (replaces embed player)
- Requires Apple Developer account ($99/year)
- Swap `player.ts` from iframe management to MusicKit JS calls
- Gains: custom UI, progress bar, play/pause/next controls, track info in real-time
- Rest of the app (shuffle, library, API) unchanged

### Multi-user (add Supabase)
- Replace `library.json` with Supabase Postgres
- Add Supabase Auth for user accounts
- Per-user libraries
- Swap file read/write in `routes.ts` for Supabase queries

## Out of Scope for MVP

- User authentication
- Multiple users / per-user libraries
- Queue / playlist ordering
- Search within library
- List view of all albums
- Custom playback controls (play/pause/next beyond what embed provides)
- Deployment configuration
