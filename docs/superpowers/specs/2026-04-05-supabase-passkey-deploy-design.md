# Pear Music — Supabase Backend, Passkey Auth & LKE Deployment

**Date:** 2026-04-05
**Status:** Approved

## Overview

Rearchitect pear-music from Express + JSON file storage to a static SPA backed by Supabase. Add passkey (WebAuthn) authentication for a single user. Deploy to LKE as `music.mltru.com` via Woodpecker CI/CD.

## Architecture

```
Browser (music.mltru.com)
  ├── supabase-js → Supabase Postgres (library CRUD, protected by RLS)
  └── fetch → Supabase Edge Functions
        ├── /auth/* → WebAuthn ceremony (@simplewebauthn/server)
        └── /metadata → iTunes Lookup/Search API proxy
```

- **Frontend:** Static SPA (Vite + vanilla TypeScript) served by nginx on LKE
- **Backend:** Supabase only — Postgres + Edge Functions
- **No custom server:** Express backend is removed entirely
- **Albums only:** Playlists are out of scope (iTunes API doesn't support playlist lookups)

## Data Model

### Tables

```sql
users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username     text UNIQUE NOT NULL,
  display_name text,
  created_at   timestamptz DEFAULT now()
)

user_credentials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  credential_id  bytea UNIQUE NOT NULL,
  public_key     bytea NOT NULL,
  sign_count     bigint DEFAULT 0,
  device_info    text,
  created_at     timestamptz DEFAULT now()
)

webauthn_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge   text NOT NULL,
  type        text NOT NULL CHECK (type IN ('registration', 'login')),
  created_at  timestamptz DEFAULT now()
  -- Rows deleted after use or after 5-minute TTL via Edge Function cleanup
)

library_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  collection_id  bigint NOT NULL,
  name           text NOT NULL,
  artist_name    text NOT NULL,
  artwork_url    text NOT NULL,
  storefront     text DEFAULT 'us',
  genre          text,
  release_date   timestamptz,
  url            text,
  added_at       timestamptz DEFAULT now(),
  UNIQUE(user_id, collection_id)
)
```

### Row Level Security

All tables use RLS gated on the JWT `user_id` claim:

- `library_items`: SELECT, INSERT, DELETE WHERE `user_id = auth.uid()`
- `users`: SELECT WHERE `id = auth.uid()`
- `user_credentials`: No direct client access — managed only via Edge Functions

## Authentication

### Flow

Single-user, passkey-first. First visitor claims the app.

**Determining state:**
1. Frontend checks if `users` table is empty (public SELECT policy on count, or an unauthenticated Edge Function)
2. Empty → show registration screen
3. Not empty → show login screen

**Registration (one-time):**
1. User enters username
2. Frontend calls `POST /auth/register-options` Edge Function
3. Edge Function generates WebAuthn challenge, stores in `webauthn_challenges` table (short TTL, cleaned up after use), returns options
4. Browser calls `navigator.credentials.create(options)` — user touches biometric
5. Frontend sends attestation to `POST /auth/register` Edge Function
6. Edge Function verifies attestation, creates `users` + `user_credentials` rows, mints Supabase JWT
7. Frontend stores JWT, initializes `supabase-js` client with it

**Login:**
1. Frontend calls `POST /auth/login-options` Edge Function
2. Edge Function generates assertion challenge, returns options
3. Browser calls `navigator.credentials.get(options)` — user touches biometric
4. Frontend sends assertion to `POST /auth/login` Edge Function
5. Edge Function verifies signature + sign count, mints Supabase JWT

**Session:**
- JWT stored in localStorage, 24-hour expiry
- On expiry, user re-authenticates via passkey (instant tap)
- No cookies, no server-side sessions

**Lockout:**
- Registration endpoint rejects if `users` table is non-empty
- Single user enforced at the Edge Function level

### Edge Function Auth Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /auth/register-options` | Start registration (only if no users) |
| `POST /auth/register` | Complete registration, return JWT |
| `POST /auth/login-options` | Start login challenge |
| `POST /auth/login` | Verify assertion, return JWT |

### Libraries

- **Server (Edge Function / Deno):** `@simplewebauthn/server`
- **Client (browser):** `@simplewebauthn/browser`

## Metadata & iTunes Integration

### Album Lookup (at add-time via URL paste)

User pastes an Apple Music URL → frontend parses out `collection_id` and `storefront` → calls Edge Function:

```
Edge Function /metadata/lookup
  → GET https://itunes.apple.com/lookup?id={collection_id}&country={storefront}
  → Returns: name, artist, artwork_url, genre, release_date
  → Stores in library_items via Supabase admin client
  → Returns metadata to frontend
```

### iTunes Search

Search bar in iTunes mode calls Edge Function:

```
Edge Function /metadata/search
  → GET https://itunes.apple.com/search?term={query}&entity=album&limit=25&country={storefront}
  → Returns array of album results (name, artist, artwork, collection_id)
  → Frontend displays results with "Add" button
  → On add: stores directly (metadata already available from search)
```

### Artwork Resolution

iTunes API returns 100x100 artwork URLs. The URL pattern allows size substitution:
`100x100bb.jpg` → `600x600bb.jpg` for high-res display.

## Frontend

### Tech Stack

- Vite + vanilla TypeScript (no framework change)
- `supabase-js` client for DB access
- `@simplewebauthn/browser` for passkey ceremony
- Dark theme CSS (Apple Music aesthetic, existing style)

### Screens

1. **Setup screen** (first visit, users table empty)
   - Username input + "Register with passkey" button

2. **Login screen** (users table has entry)
   - "Sign in with passkey" button

3. **Main screen** (authenticated)
   - Search bar with **Library | iTunes** toggle
   - Album grid/list: artwork, name, artist
   - Tap album → loads Apple Music embed player
   - Shuffle button (random album from library)
   - In iTunes mode: search results show "+" add button
   - In Library mode: items show "−" remove button

### Player

Apple Music embedded iframe, same as current implementation:
```
https://embed.music.apple.com/{storefront}/album/{collection_id}?autoplay=1
```

### Add Flows

1. **Via iTunes search:** Toggle to iTunes → type query → browse results → tap "+" → saved
2. **Via URL paste:** "+" button → paste Apple Music URL → Edge Function resolves metadata → saved

## Deployment

### Container

Static SPA served by nginx Alpine:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist/client /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### Kubernetes (LKE, `mltru-com` namespace)

Shared namespace with `mltru.com` site. Resources:

- **Deployment:** `pear-music`, 1 replica, nginx container
- **Service:** ClusterIP, port 80 → 80
- **Ingress:** host `music.mltru.com`, TLS via cert-manager/letsencrypt-prod
- **Image:** `registry.dala-triceratops.ts.net/pear-music:{tag}`
- **imagePullSecrets:** `registry-credentials` (already in namespace)
- **Resources:** 32Mi–64Mi memory, 10m–50m CPU

K8s manifests live in `k8s/` directory, which is in `.gitignore` (local only, not committed).

### Woodpecker CI/CD

`.woodpecker.yml` committed to repo. Pipeline:

1. **Build:** `npm ci && npm run build`
2. **Docker:** Build image, tag with date + build number, push to `registry.dala-triceratops.ts.net/pear-music`
3. **Deploy:** `kubectl set image deployment/pear-music -n mltru-com web=registry.dala-triceratops.ts.net/pear-music:{tag}` + rollout wait

### Supabase Edge Functions

Deployed separately via `supabase functions deploy` (CLI or Woodpecker step). Not containerized.

### Environment

Supabase URL and anon key are baked into the frontend build as Vite env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). These are public by design — RLS protects the data.

## Supabase Project Setup

New Supabase project created from scratch:

1. Create project on supabase.com (free tier)
2. Enable pgvector extension (not needed now, but free to enable)
3. Create tables + RLS policies via SQL migration
4. Deploy Edge Functions via CLI
5. Configure Fido2 origin: `https://music.mltru.com`

## What Gets Removed

- `src/server/` — entire Express backend
- `data/library.json` — file-based storage
- `tsconfig.server.json` — server TypeScript config
- Server-related test files (replaced with new tests)
- `node-html-parser` dependency (no more OG scraping)
- `express`, `supertest` dependencies

## What Gets Added

- `supabase-js` client library
- `@simplewebauthn/browser` client library
- `supabase/` directory for Edge Functions source
- `.woodpecker.yml` CI/CD pipeline
- `nginx.conf` for SPA routing
- `Dockerfile` for nginx static build
- `k8s/` directory (local only, gitignored)

## Testing

- **Frontend:** Vitest for unit tests (URL parsing, search logic, UI state)
- **Edge Functions:** Tested via Supabase CLI local dev (`supabase functions serve`)
- **Integration:** Manual testing against Supabase local or remote project
