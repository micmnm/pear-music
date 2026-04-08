# Pear Music

An Apple Music library manager. Add albums, shuffle your collection, search iTunes to discover new music. Plays via Apple Music embedded player.

Run as a personal single-user app, or deploy as a multi-user instance with admin controls. Passkey (WebAuthn) authentication, no passwords. The first user to sign up on a fresh deploy becomes the admin; subsequent users can join up to a soft cap of 15 active users, after which they go on a waitlist for admin approval.

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

### 3. Run database migrations

Apply all migrations in `supabase/migrations/` in order (001 → 002 → 003 → 004). Easiest path via the Supabase CLI after linking your project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Or paste each file's contents into the Supabase SQL Editor one at a time, in filename order.

### 4. Deploy Edge Functions

```bash
supabase functions deploy auth
supabase functions deploy metadata
supabase functions deploy admin --no-verify-jwt
```

> The `admin` function is deployed with `--no-verify-jwt` because it performs its own authorization check (reads the caller's JWT and verifies `is_admin = true` in the database). The gateway's built-in JWT verification is redundant and was found to interfere during the rollout.

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

## Multi-tenant mode

Pear Music supports multiple users on a single deployment. The first user to sign up on a fresh deploy automatically becomes the admin. Subsequent users are admitted instantly until the active-user cap (default 15) is reached, after which new signups go onto a waitlist for admin approval.

### Admin features

The admin sees an "Admin" link in the header that opens a page where they can:

- See all users (active, pending approval, rejected) with their join date and album count.
- Approve / reject users on the waitlist.
- Delete active users (frees a slot).
- Change the maximum active user cap (cannot shrink below the current active count).

### Limitations (intentional, by design)

- **No email is ever sent.** Email addresses are unverified — they're identifiers/labels only.
- **Lost device = lost library.** There is no passkey re-enrollment in the v1 multi-tenant build. If a user loses their device, recovery is admin-mediated: the admin deletes the account and the user re-registers from scratch.
- **No edit-email UI.** Email typos at signup are unfixable without admin intervention.
- **Admin notifications are pull-based.** The admin sees a banner when they open the app — there's no push notification when someone signs up.

### Migrating an existing single-user instance to multi-tenant

If you're running a pre-multi-tenant version and applying migration 003 for the first time, the migration backfills your existing user row with `email = '<old-username>@pear.music'` (a synthetic address). You'll want to update it to a real email manually so login works reliably across the auth layers:

```sql
-- In the Supabase SQL Editor
UPDATE users SET email = 'you@example.com' WHERE is_admin = true;
```

Then also update the corresponding `auth.users` row via **Supabase Dashboard → Authentication → Users → Edit email**. Both must match — the app reads from `public.users.email` and then asks Supabase Auth for a session using that same email.

Your `display_name` will also be set to the new email. There's no UI to edit it in v1; if you want a different name, `UPDATE users SET display_name = 'Your Name' WHERE ...` in SQL.

## Deployment (Kubernetes)

The included `.woodpecker.yml` provides a CI/CD pipeline that builds a Docker image, pushes to a registry, and deploys to a Kubernetes cluster. You'll need to configure:

- A Docker registry
- A Kubernetes cluster with nginx ingress and cert-manager
- Woodpecker CI secrets (see comments in `.woodpecker.yml`)

Create your own `k8s/` directory (gitignored) with deployment, service, and ingress manifests for your domain.

## Project structure

```
src/client/             Frontend (Vite + TypeScript)
  main.ts               App entry point + routing
  auth.ts               Passkey registration/login, state machine
  admin.ts              Admin API client (wraps admin Edge Function)
  library.ts            Library CRUD via Supabase
  search.ts             iTunes search + lookup
  player.ts             Apple Music embed player
  settings.ts           Per-user storefront preference
  url-parser.ts         Apple Music URL → collection id
  supabase.ts           Supabase JS client singleton
  ui.ts                 DOM rendering + screen management
src/shared/
  types.ts              Types shared between client and Edge Functions
supabase/
  functions/auth/       WebAuthn registration + login
  functions/admin/      Admin actions (list/approve/reject/delete/set-cap)
  functions/metadata/   iTunes API proxy (CORS workaround)
  functions/_shared/    Pure functions shared across Edge Functions
  migrations/           Database schema (run in filename order)
tests/
  client/               Vitest unit tests for pure client logic
  functions/            Vitest unit tests for pure Edge Function logic
```

## Tech stack

- [Vite](https://vitejs.dev) + TypeScript
- [Supabase](https://supabase.com) (Postgres, Edge Functions, Auth)
- [@simplewebauthn](https://simplewebauthn.dev) (passkey auth)
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) (album metadata)
- Apple Music embedded player

## License

MIT
