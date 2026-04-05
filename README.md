# Pear Music

A personal Apple Music library manager. Add albums, shuffle your collection, search iTunes to discover new music. Plays via Apple Music embedded player.

Single-user app with passkey (WebAuthn) authentication. No passwords.

## How it works

- **Static SPA** (Vite + TypeScript) served by nginx
- **Supabase** for database (Postgres + RLS) and Edge Functions
- **Passkey auth** via WebAuthn — first visitor claims the app
- **iTunes API** for album search and metadata (proxied through Edge Function to avoid CORS)
- **Apple Music embed** for playback

## Prerequisites

- Node.js 24+
- A [Supabase](https://supabase.com) account (free tier works)
- Supabase CLI (`npm install -g supabase`)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/micmnm/pear-music.git
cd pear-music
npm install
```

### 2. Create Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project (free tier)
2. Note your **Project URL** and **anon key** from Settings > API

### 3. Run database migration

In the Supabase SQL Editor, paste and run the contents of `supabase/migrations/001_schema.sql`.

### 4. Deploy Edge Functions

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy auth
supabase functions deploy metadata
```

### 5. Set Edge Function secrets

In Supabase Dashboard > Edge Functions > Secrets:

| Secret | Value |
|--------|-------|
| `WEBAUTHN_RP_ID` | Your domain (e.g. `music.example.com`) or `localhost` for dev |
| `WEBAUTHN_ORIGIN` | Your origin (e.g. `https://music.example.com`) or `http://localhost:5173` for dev |

### 6. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase project URL and anon key.

### 7. Run locally

```bash
npm run dev
```

Open `http://localhost:5173`. First visit shows the passkey registration screen.

> **Note:** For local development, set the Edge Function secrets `WEBAUTHN_RP_ID=localhost` and `WEBAUTHN_ORIGIN=http://localhost:5173`.

## Building for production

```bash
npm run build
```

Output goes to `dist/`. Serve with any static file server (nginx, Caddy, etc).

## Docker

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your-anon-key \
  -t pear-music .
docker run -p 80:80 pear-music
```

## Deployment (Kubernetes)

The included `.woodpecker.yml` provides a CI/CD pipeline that builds a Docker image, pushes to a registry, and deploys to a Kubernetes cluster. You'll need to configure:

- A Docker registry
- A Kubernetes cluster with nginx ingress and cert-manager
- Woodpecker CI secrets (see comments in `.woodpecker.yml`)

Create your own `k8s/` directory (gitignored) with deployment, service, and ingress manifests for your domain.

## Project structure

```
src/client/           Frontend (Vite + TypeScript)
  auth.ts             Passkey registration/login
  library.ts          Library CRUD via Supabase
  search.ts           iTunes search + lookup
  player.ts           Apple Music embed player
  ui.ts               DOM rendering
  main.ts             App entry point
supabase/
  functions/auth/     WebAuthn Edge Function
  functions/metadata/ iTunes API proxy Edge Function
  migrations/         Database schema
```

## Tech stack

- [Vite](https://vitejs.dev) + TypeScript
- [Supabase](https://supabase.com) (Postgres, Edge Functions, Auth)
- [@simplewebauthn](https://simplewebauthn.dev) (passkey auth)
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) (album metadata)
- Apple Music embedded player

## License

MIT
