# Supabase Backend, Passkey Auth & LKE Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rearchitect pear-music from Express + JSON file to a static SPA backed by Supabase with passkey auth, deployed to LKE as music.mltru.com.

**Architecture:** Static Vite SPA served by nginx on LKE. Supabase Postgres for data (RLS-protected). Supabase Edge Functions for WebAuthn passkey ceremony and iTunes API proxy. Woodpecker CI/CD builds and deploys the nginx container.

**Tech Stack:** Vite, vanilla TypeScript, supabase-js, @simplewebauthn/browser, @simplewebauthn/server (Deno/npm), Supabase Edge Functions, Postgres + RLS, nginx, Docker, Kubernetes (LKE), Woodpecker CI.

---

## File Map

### Files to Create

```
src/client/auth.ts              — Passkey registration/login UI logic
src/client/supabase.ts          — Supabase client init + auth state
src/client/search.ts            — iTunes search + library search logic
src/client/library.ts           — Library CRUD via supabase-js
src/client/url-parser.ts        — Apple Music URL parsing (moved from server)
supabase/config.toml            — Supabase project local config
supabase/functions/auth/index.ts        — WebAuthn Edge Function (register + login)
supabase/functions/metadata/index.ts    — iTunes lookup + search proxy
supabase/migrations/001_schema.sql      — Tables, RLS policies, indexes
Dockerfile                      — Multi-stage nginx build
nginx.conf                      — SPA routing config
.woodpecker.yml                 — CI/CD pipeline
.dockerignore                   — Docker build exclusions
tests/client/url-parser.test.ts — URL parsing unit tests
tests/client/library.test.ts    — Library module tests (mocked supabase)
```

### Files to Modify

```
index.html                      — Add auth screens, search UI, restructure layout
src/client/main.ts              — Rewrite: auth gate, search, supabase init
src/client/player.ts            — Use storefront + collection_id instead of LibraryItem.url
src/client/ui.ts                — Add auth UI helpers, search UI, album grid
src/client/style.css            — Add auth screen, search bar, album grid styles
src/shared/types.ts             — New types for Supabase schema
package.json                    — New deps, remove server deps, update scripts
tsconfig.json                   — Remove server references
vite.config.ts                  — Remove API proxy, add env vars
.gitignore                      — Add k8s/, supabase/.env
```

### Files to Delete

```
src/server/                     — Entire directory (index.ts, routes.ts, apple.ts, library.ts)
tsconfig.server.json            — Server TypeScript config
data/                           — library.json file storage
tests/server/                   — Server tests (replaced by client tests)
```

---

## Task 1: Clean Up Server Code and Dependencies

Remove the Express backend, server tests, and unused dependencies.

**Files:**
- Delete: `src/server/index.ts`, `src/server/routes.ts`, `src/server/apple.ts`, `src/server/library.ts`
- Delete: `tsconfig.server.json`
- Delete: `tests/server/apple.test.ts`, `tests/server/library.test.ts`, `tests/server/routes.test.ts`
- Delete: `data/library.json`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Delete server source files**

```bash
rm -rf src/server/ tsconfig.server.json tests/server/ data/
```

- [ ] **Step 2: Update package.json — remove server deps, add new deps, update scripts**

Replace entire `package.json` with:

```json
{
  "name": "pear-music",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@simplewebauthn/browser": "^13.0.0",
    "@supabase/supabase-js": "^2.49.0"
  },
  "devDependencies": {
    "typescript": "^6.0.2",
    "vite": "^8.0.3",
    "vitest": "^4.1.2"
  }
}
```

- [ ] **Step 3: Update vite.config.ts — remove proxy, add env**

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyDirOnBuild: true,
  },
});
```

- [ ] **Step 4: Update .gitignore**

```
node_modules/
dist/
.env
k8s/
supabase/.env
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: Clean install with no server deps.

- [ ] **Step 6: Verify build works**

Run: `npm run build`
Expected: Vite builds to `dist/` (will have TS errors initially — that's fine, we'll fix in next tasks).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove Express backend, prepare for Supabase migration"
```

---

## Task 2: New Types and URL Parser

Define the new Supabase-aligned types and move Apple Music URL parsing to the client.

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/client/url-parser.ts`
- Create: `tests/client/url-parser.test.ts`

- [ ] **Step 1: Write URL parser tests**

Create `tests/client/url-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseAppleMusicUrl } from "../../src/client/url-parser.js";

describe("parseAppleMusicUrl", () => {
  it("parses a standard album URL", () => {
    const result = parseAppleMusicUrl(
      "https://music.apple.com/us/album/ok-computer/1097861387"
    );
    expect(result).toEqual({
      type: "album",
      collectionId: "1097861387",
      storefront: "us",
    });
  });

  it("parses a beta domain URL", () => {
    const result = parseAppleMusicUrl(
      "https://beta.music.apple.com/ro/album/honora/1861644307"
    );
    expect(result).toEqual({
      type: "album",
      collectionId: "1861644307",
      storefront: "ro",
    });
  });

  it("returns null for non-Apple Music URLs", () => {
    expect(parseAppleMusicUrl("https://spotify.com/album/123")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(parseAppleMusicUrl("not a url")).toBeNull();
  });

  it("returns null for URLs with too few path segments", () => {
    expect(parseAppleMusicUrl("https://music.apple.com/us")).toBeNull();
  });

  it("returns null for non-album types", () => {
    expect(
      parseAppleMusicUrl("https://music.apple.com/us/playlist/chill/pl.abc123")
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/client/url-parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Update types**

Replace `src/shared/types.ts`:

```typescript
export interface LibraryItem {
  id: string;
  user_id: string;
  collection_id: number;
  name: string;
  artist_name: string;
  artwork_url: string;
  storefront: string;
  genre: string | null;
  release_date: string | null;
  url: string | null;
  added_at: string;
}

export interface ParsedAppleUrl {
  type: "album";
  collectionId: string;
  storefront: string;
}

export interface ITunesAlbumResult {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl100: string;
  primaryGenreName: string;
  releaseDate: string;
  country: string;
}

export interface ITunesSearchResponse {
  resultCount: number;
  results: ITunesAlbumResult[];
}
```

- [ ] **Step 4: Implement URL parser**

Create `src/client/url-parser.ts`:

```typescript
import type { ParsedAppleUrl } from "../shared/types.js";

export function parseAppleMusicUrl(url: string): ParsedAppleUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (
    !parsed.hostname.endsWith("music.apple.com")
  ) {
    return null;
  }

  // Path: /{storefront}/album/{slug}/{id}
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 4) return null;

  const [storefront, type, , collectionId] = segments;

  if (type !== "album") return null;

  return { type, collectionId, storefront };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/client/url-parser.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/client/url-parser.ts tests/client/url-parser.test.ts
git commit -m "feat: add client-side URL parser and Supabase-aligned types"
```

---

## Task 3: Supabase Client Module

Set up the Supabase JS client with auth state management.

**Files:**
- Create: `src/client/supabase.ts`

- [ ] **Step 1: Create Supabase client module**

Create `src/client/supabase.ts`:

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

export function setSession(accessToken: string): void {
  // Store JWT for supabase-js to use
  localStorage.setItem("pear_music_jwt", accessToken);
}

export function getStoredToken(): string | null {
  return localStorage.getItem("pear_music_jwt");
}

export function clearSession(): void {
  localStorage.removeItem("pear_music_jwt");
}

export function getAuthenticatedClient(): SupabaseClient {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
```

- [ ] **Step 2: Create .env file for local development**

Create `.env` (gitignored):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

- [ ] **Step 3: Commit**

```bash
git add src/client/supabase.ts
git commit -m "feat: add Supabase client module with JWT session management"
```

---

## Task 4: Library Module (Supabase CRUD)

Replace the old fetch-based API module with direct Supabase queries.

**Files:**
- Create: `src/client/library.ts`
- Delete: `src/client/api.ts`

- [ ] **Step 1: Delete old API module**

```bash
rm src/client/api.ts
```

- [ ] **Step 2: Create library module**

Create `src/client/library.ts`:

```typescript
import type { LibraryItem } from "../shared/types.js";
import { getAuthenticatedClient } from "./supabase.js";

export async function getLibrary(): Promise<LibraryItem[]> {
  const client = getAuthenticatedClient();
  const { data, error } = await client
    .from("library_items")
    .select("*")
    .order("added_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data as LibraryItem[];
}

export async function searchLibrary(query: string): Promise<LibraryItem[]> {
  const client = getAuthenticatedClient();
  const { data, error } = await client
    .from("library_items")
    .select("*")
    .or(`name.ilike.%${query}%,artist_name.ilike.%${query}%`)
    .order("name");

  if (error) throw new Error(error.message);
  return data as LibraryItem[];
}

export async function addToLibrary(item: {
  collection_id: number;
  name: string;
  artist_name: string;
  artwork_url: string;
  storefront: string;
  genre: string | null;
  release_date: string | null;
  url: string | null;
}): Promise<LibraryItem> {
  const client = getAuthenticatedClient();
  const token = localStorage.getItem("pear_music_jwt");
  // Decode JWT to get user_id (sub claim)
  const payload = JSON.parse(atob(token!.split(".")[1]));
  const user_id = payload.sub;

  const { data, error } = await client
    .from("library_items")
    .insert({ ...item, user_id })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Album already in library");
    throw new Error(error.message);
  }
  return data as LibraryItem;
}

export async function removeFromLibrary(id: string): Promise<void> {
  const client = getAuthenticatedClient();
  const { error } = await client.from("library_items").delete().eq("id", id);

  if (error) throw new Error(error.message);
}

export async function getRandomItem(): Promise<LibraryItem | null> {
  const items = await getLibrary();
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/library.ts
git commit -m "feat: add library module with Supabase CRUD and search"
```

---

## Task 5: Search Module (iTunes + Library)

Create the search module that proxies iTunes API calls through the Edge Function.

**Files:**
- Create: `src/client/search.ts`

- [ ] **Step 1: Create search module**

Create `src/client/search.ts`:

```typescript
import type { ITunesAlbumResult, ITunesSearchResponse } from "../shared/types.js";
import { supabase } from "./supabase.js";
import { getStoredToken } from "./supabase.js";

export async function searchItunes(
  query: string,
  storefront: string = "us"
): Promise<ITunesAlbumResult[]> {
  const token = getStoredToken();
  const response = await supabase.functions.invoke("metadata", {
    body: { action: "search", query, storefront },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.error) throw new Error(response.error.message);
  const data = response.data as ITunesSearchResponse;
  return data.results.filter(
    (r: ITunesAlbumResult) => r.collectionId !== undefined
  );
}

export async function lookupAlbum(
  collectionId: string,
  storefront: string = "us"
): Promise<ITunesAlbumResult | null> {
  const token = getStoredToken();
  const response = await supabase.functions.invoke("metadata", {
    body: { action: "lookup", collectionId, storefront },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.error) throw new Error(response.error.message);
  const data = response.data as ITunesSearchResponse;
  return data.results.length > 0 ? data.results[0] : null;
}

export function artworkUrl(url100: string, size: number = 600): string {
  return url100.replace("100x100bb", `${size}x${size}bb`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/search.ts
git commit -m "feat: add iTunes search and lookup via Edge Function"
```

---

## Task 6: Auth Module (Passkey Registration & Login)

Implement the client-side WebAuthn ceremony using @simplewebauthn/browser.

**Files:**
- Create: `src/client/auth.ts`

- [ ] **Step 1: Create auth module**

Create `src/client/auth.ts`:

```typescript
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { supabase } from "./supabase.js";
import { setSession } from "./supabase.js";

export async function checkAppState(): Promise<"setup" | "login" | "authenticated"> {
  const token = localStorage.getItem("pear_music_jwt");
  if (token) {
    // Verify token is still valid by checking expiry
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp * 1000 > Date.now()) return "authenticated";
    } catch {
      // Invalid token, fall through
    }
    localStorage.removeItem("pear_music_jwt");
  }

  // Check if any users exist
  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  if (error || count === null || count === 0) return "setup";
  return "login";
}

export async function register(username: string): Promise<void> {
  // Step 1: Get registration options from Edge Function
  const optionsRes = await supabase.functions.invoke("auth", {
    body: { action: "register-options", username },
  });
  if (optionsRes.error) throw new Error(optionsRes.error.message);

  const { options, challengeId } = optionsRes.data;

  // Step 2: Create credential via browser WebAuthn API
  const attestation = await startRegistration({ optionsJSON: options });

  // Step 3: Send attestation to Edge Function for verification
  const verifyRes = await supabase.functions.invoke("auth", {
    body: { action: "register", challengeId, attestation },
  });
  if (verifyRes.error) throw new Error(verifyRes.error.message);

  // Step 4: Store JWT
  setSession(verifyRes.data.token);
}

export async function login(): Promise<void> {
  // Step 1: Get login options from Edge Function
  const optionsRes = await supabase.functions.invoke("auth", {
    body: { action: "login-options" },
  });
  if (optionsRes.error) throw new Error(optionsRes.error.message);

  const { options, challengeId } = optionsRes.data;

  // Step 2: Get assertion via browser WebAuthn API
  const assertion = await startAuthentication({ optionsJSON: options });

  // Step 3: Send assertion to Edge Function for verification
  const verifyRes = await supabase.functions.invoke("auth", {
    body: { action: "login", challengeId, assertion },
  });
  if (verifyRes.error) throw new Error(verifyRes.error.message);

  // Step 4: Store JWT
  setSession(verifyRes.data.token);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/auth.ts
git commit -m "feat: add passkey auth module with registration and login"
```

---

## Task 7: Supabase Edge Function — Auth (WebAuthn)

Implement the server-side WebAuthn ceremony as a Supabase Edge Function.

**Files:**
- Create: `supabase/functions/auth/index.ts`

- [ ] **Step 1: Initialize Supabase functions directory**

```bash
mkdir -p supabase/functions/auth
```

- [ ] **Step 2: Create auth Edge Function**

Create `supabase/functions/auth/index.ts`:

```typescript
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@13.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encode as base64Encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RP_NAME = "Pear Music";
const RP_ID = Deno.env.get("WEBAUTHN_RP_ID") || "music.mltru.com";
const RP_ORIGIN = Deno.env.get("WEBAUTHN_ORIGIN") || "https://music.mltru.com";
const JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET")!;

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function mintJwt(userId: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    role: "authenticated",
    iss: "pear-music",
    iat: now,
    exp: now + 86400, // 24 hours
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "");
  const data = encoder.encode(`${headerB64}.${payloadB64}`);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, data);
  const sigB64 = base64Encode(new Uint8Array(signature))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${headerB64}.${payloadB64}.${sigB64}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      },
    });
  }

  try {
    const { action, ...params } = await req.json();
    const db = getAdminClient();

    // === REGISTER OPTIONS ===
    if (action === "register-options") {
      // Check no users exist
      const { count } = await db
        .from("users")
        .select("*", { count: "exact", head: true });
      if (count && count > 0) {
        return Response.json({ error: "Registration closed" }, { status: 403 });
      }

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: params.username,
        userDisplayName: params.username,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      });

      // Store challenge
      const { data: challenge } = await db
        .from("webauthn_challenges")
        .insert({
          challenge: options.challenge,
          type: "registration",
          metadata: { username: params.username },
        })
        .select()
        .single();

      return Response.json({ options, challengeId: challenge!.id });
    }

    // === REGISTER ===
    if (action === "register") {
      const { challengeId, attestation } = params;

      // Get stored challenge
      const { data: challenge } = await db
        .from("webauthn_challenges")
        .select("*")
        .eq("id", challengeId)
        .single();

      if (!challenge) {
        return Response.json({ error: "Invalid challenge" }, { status: 400 });
      }

      // Delete challenge (one-time use)
      await db.from("webauthn_challenges").delete().eq("id", challengeId);

      const verification = await verifyRegistrationResponse({
        response: attestation,
        expectedChallenge: challenge.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return Response.json({ error: "Verification failed" }, { status: 400 });
      }

      const { credential, credentialDeviceType } = verification.registrationInfo;

      // Create user
      const { data: user } = await db
        .from("users")
        .insert({
          username: challenge.metadata.username,
          display_name: challenge.metadata.username,
        })
        .select()
        .single();

      // Store credential
      await db.from("user_credentials").insert({
        user_id: user!.id,
        credential_id: base64Encode(credential.id),
        public_key: base64Encode(credential.publicKey),
        sign_count: credential.counter,
        device_info: credentialDeviceType,
      });

      const token = await mintJwt(user!.id);
      return Response.json({ token, userId: user!.id });
    }

    // === LOGIN OPTIONS ===
    if (action === "login-options") {
      // Get all credentials for allowCredentials list
      const { data: creds } = await db
        .from("user_credentials")
        .select("credential_id");

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: "preferred",
        allowCredentials: (creds || []).map((c: { credential_id: string }) => ({
          id: Uint8Array.from(atob(c.credential_id), (ch) => ch.charCodeAt(0)),
          type: "public-key",
        })),
      });

      const { data: challenge } = await db
        .from("webauthn_challenges")
        .insert({ challenge: options.challenge, type: "login" })
        .select()
        .single();

      return Response.json({ options, challengeId: challenge!.id });
    }

    // === LOGIN ===
    if (action === "login") {
      const { challengeId, assertion } = params;

      const { data: challenge } = await db
        .from("webauthn_challenges")
        .select("*")
        .eq("id", challengeId)
        .single();

      if (!challenge) {
        return Response.json({ error: "Invalid challenge" }, { status: 400 });
      }

      await db.from("webauthn_challenges").delete().eq("id", challengeId);

      // Find the credential
      const assertionCredId = assertion.id;
      const { data: creds } = await db
        .from("user_credentials")
        .select("*, users(*)")
        .eq("credential_id", assertionCredId);

      if (!creds || creds.length === 0) {
        return Response.json({ error: "Unknown credential" }, { status: 400 });
      }

      const cred = creds[0];

      const verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: Uint8Array.from(atob(cred.credential_id), (ch) => ch.charCodeAt(0)),
          publicKey: Uint8Array.from(atob(cred.public_key), (ch) => ch.charCodeAt(0)),
          counter: cred.sign_count,
        },
      });

      if (!verification.verified) {
        return Response.json({ error: "Verification failed" }, { status: 400 });
      }

      // Update sign count
      await db
        .from("user_credentials")
        .update({ sign_count: verification.authenticationInfo.newCounter })
        .eq("id", cred.id);

      const token = await mintJwt(cred.user_id);
      return Response.json({ token, userId: cred.user_id });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/auth/
git commit -m "feat: add WebAuthn auth Edge Function"
```

---

## Task 8: Supabase Edge Function — Metadata (iTunes Proxy)

Proxy iTunes Lookup and Search API calls through a Supabase Edge Function.

**Files:**
- Create: `supabase/functions/metadata/index.ts`

- [ ] **Step 1: Create metadata Edge Function**

```bash
mkdir -p supabase/functions/metadata
```

Create `supabase/functions/metadata/index.ts`:

```typescript
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      },
    });
  }

  try {
    const { action, ...params } = await req.json();

    if (action === "search") {
      const { query, storefront = "us" } = params;
      if (!query) {
        return Response.json({ error: "query required" }, { status: 400 });
      }

      const url = `https://itunes.apple.com/search?${new URLSearchParams({
        term: query,
        entity: "album",
        limit: "25",
        country: storefront,
      })}`;

      const res = await fetch(url);
      const data = await res.json();
      return Response.json(data);
    }

    if (action === "lookup") {
      const { collectionId, storefront = "us" } = params;
      if (!collectionId) {
        return Response.json({ error: "collectionId required" }, { status: 400 });
      }

      const url = `https://itunes.apple.com/lookup?${new URLSearchParams({
        id: collectionId,
        country: storefront,
      })}`;

      const res = await fetch(url);
      const data = await res.json();
      return Response.json(data);
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/metadata/
git commit -m "feat: add iTunes metadata proxy Edge Function"
```

---

## Task 9: Supabase Database Schema (SQL Migration)

Create the database schema with tables, RLS policies, and indexes.

**Files:**
- Create: `supabase/migrations/001_schema.sql`

- [ ] **Step 1: Create migration file**

```bash
mkdir -p supabase/migrations
```

Create `supabase/migrations/001_schema.sql`:

```sql
-- ============================================
-- Pear Music Schema
-- ============================================

-- Users table (single user, passkey auth)
CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username     text UNIQUE NOT NULL,
  display_name text,
  created_at   timestamptz DEFAULT now()
);

-- WebAuthn credentials (multiple passkeys per user)
CREATE TABLE user_credentials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  credential_id  text UNIQUE NOT NULL,
  public_key     text NOT NULL,
  sign_count     bigint DEFAULT 0,
  device_info    text,
  created_at     timestamptz DEFAULT now()
);

-- Temporary WebAuthn challenges (cleaned up after use)
CREATE TABLE webauthn_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge   text NOT NULL,
  type        text NOT NULL CHECK (type IN ('registration', 'login')),
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- Library items (albums)
CREATE TABLE library_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
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
);

-- Indexes
CREATE INDEX idx_library_items_user_id ON library_items(user_id);
CREATE INDEX idx_library_items_name ON library_items USING gin(name gin_trgm_ops);
CREATE INDEX idx_library_items_artist ON library_items USING gin(artist_name gin_trgm_ops);
CREATE INDEX idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX idx_webauthn_challenges_created ON webauthn_challenges(created_at);

-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;

-- Users: authenticated users can read their own row
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  USING (id = auth.uid());

-- Users: allow unauthenticated count check (for setup detection)
CREATE POLICY "Anyone can count users"
  ON users FOR SELECT
  USING (true);

-- Library items: full CRUD for own items
CREATE POLICY "Users can read own library"
  ON library_items FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own library"
  ON library_items FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own library"
  ON library_items FOR DELETE
  USING (user_id = auth.uid());

-- User credentials: no direct client access (managed by Edge Functions with service key)
-- No policies needed — service key bypasses RLS

-- WebAuthn challenges: no direct client access (managed by Edge Functions with service key)
-- No policies needed — service key bypasses RLS
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add database schema with RLS policies"
```

---

## Task 10: Update Player Module

Update the player to use the new LibraryItem type (storefront + collection_id).

**Files:**
- Modify: `src/client/player.ts`

- [ ] **Step 1: Update player.ts**

Replace `src/client/player.ts`:

```typescript
import type { LibraryItem } from "../shared/types.js";

const EMBED_BASE = "https://embed.music.apple.com";

export function buildEmbedUrl(item: LibraryItem): string {
  return `${EMBED_BASE}/${item.storefront}/album/${item.collection_id}?autoplay=1`;
}

export function loadEmbed(iframe: HTMLIFrameElement, item: LibraryItem): void {
  iframe.src = buildEmbedUrl(item);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/player.ts
git commit -m "refactor: update player to use collection_id and storefront"
```

---

## Task 11: Update UI Module

Rewrite UI helpers for auth screens, search bar, album grid, and player view.

**Files:**
- Modify: `src/client/ui.ts`

- [ ] **Step 1: Rewrite ui.ts**

Replace `src/client/ui.ts`:

```typescript
import type { LibraryItem, ITunesAlbumResult } from "../shared/types.js";
import { artworkUrl } from "./search.js";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

// --- Screen management ---

export function showScreen(screen: "setup" | "login" | "main"): void {
  $("setup-screen").classList.toggle("hidden", screen !== "setup");
  $("login-screen").classList.toggle("hidden", screen !== "login");
  $("main-screen").classList.toggle("hidden", screen !== "main");
}

// --- Auth UI ---

export function getSetupUsername(): string {
  return ($("setup-username") as HTMLInputElement).value.trim();
}

export function showAuthError(message: string): void {
  const el = $("auth-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

export function hideAuthError(): void {
  $("auth-error").classList.add("hidden");
}

// --- Player ---

export function showPlayer(item: LibraryItem): void {
  $("player-section").classList.remove("hidden");
  ($("artwork") as HTMLImageElement).src = artworkUrl(item.artwork_url);
  $("album-name").textContent = item.name;
  $("artist-name").textContent = item.artist_name;
}

export function hidePlayer(): void {
  $("player-section").classList.add("hidden");
}

// --- Search ---

export type SearchMode = "library" | "itunes";

export function getSearchQuery(): string {
  return ($("search-input") as HTMLInputElement).value.trim();
}

export function getSearchMode(): SearchMode {
  return ($("search-mode") as HTMLSelectElement).value as SearchMode;
}

// --- Album grid ---

export function renderAlbumGrid(
  items: LibraryItem[],
  onPlay: (item: LibraryItem) => void,
  onRemove: (item: LibraryItem) => void
): void {
  const grid = $("album-grid");
  grid.innerHTML = "";

  if (items.length === 0) {
    grid.innerHTML = '<p class="empty-message">No albums found</p>';
    return;
  }

  for (const item of items) {
    const card = document.createElement("div");
    card.className = "album-card";
    card.innerHTML = `
      <img src="${artworkUrl(item.artwork_url, 300)}" alt="${item.name}" class="album-card-art" />
      <div class="album-card-info">
        <span class="album-card-name">${item.name}</span>
        <span class="album-card-artist">${item.artist_name}</span>
      </div>
      <button class="album-card-remove" title="Remove">−</button>
    `;
    card.querySelector(".album-card-art")!.addEventListener("click", () => onPlay(item));
    card.querySelector(".album-card-info")!.addEventListener("click", () => onPlay(item));
    card.querySelector(".album-card-remove")!.addEventListener("click", (e) => {
      e.stopPropagation();
      onRemove(item);
    });
    grid.appendChild(card);
  }
}

export function renderItunesResults(
  results: ITunesAlbumResult[],
  onAdd: (result: ITunesAlbumResult) => void
): void {
  const grid = $("album-grid");
  grid.innerHTML = "";

  if (results.length === 0) {
    grid.innerHTML = '<p class="empty-message">No results found</p>';
    return;
  }

  for (const result of results) {
    const card = document.createElement("div");
    card.className = "album-card";
    card.innerHTML = `
      <img src="${artworkUrl(result.artworkUrl100, 300)}" alt="${result.collectionName}" class="album-card-art" />
      <div class="album-card-info">
        <span class="album-card-name">${result.collectionName}</span>
        <span class="album-card-artist">${result.artistName}</span>
      </div>
      <button class="album-card-add" title="Add to library">+</button>
    `;
    card.querySelector(".album-card-add")!.addEventListener("click", (e) => {
      e.stopPropagation();
      onAdd(result);
      (e.target as HTMLButtonElement).textContent = "✓";
      (e.target as HTMLButtonElement).disabled = true;
    });
    grid.appendChild(card);
  }
}

// --- Add overlay (URL paste) ---

export function showAddOverlay(): void {
  $("add-overlay").classList.remove("hidden");
  ($("url-input") as HTMLInputElement).value = "";
  $("add-error").classList.add("hidden");
  ($("url-input") as HTMLInputElement).focus();
}

export function hideAddOverlay(): void {
  $("add-overlay").classList.add("hidden");
  $("add-error").classList.add("hidden");
}

export function showAddError(message: string): void {
  const el = $("add-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

export function getUrlInputValue(): string {
  return ($("url-input") as HTMLInputElement).value.trim();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/ui.ts
git commit -m "refactor: rewrite UI module for auth screens, search, and album grid"
```

---

## Task 12: Update HTML Layout

Restructure index.html with auth screens, search bar, album grid, and player.

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Rewrite index.html**

Replace `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>mltru Apple Music</title>
    <link rel="stylesheet" href="/src/client/style.css" />
  </head>
  <body>
    <!-- Setup Screen (first visit) -->
    <div id="setup-screen" class="screen hidden">
      <div class="auth-container">
        <h1>Welcome to Pear Music</h1>
        <p>Set up your account to get started.</p>
        <input
          id="setup-username"
          type="text"
          placeholder="Choose a username"
          autocomplete="username"
        />
        <button id="setup-btn" class="btn-primary">Register with Passkey</button>
        <p id="auth-error" class="error-text hidden"></p>
      </div>
    </div>

    <!-- Login Screen -->
    <div id="login-screen" class="screen hidden">
      <div class="auth-container">
        <h1>Pear Music</h1>
        <button id="login-btn" class="btn-primary">Sign in with Passkey</button>
        <p id="auth-error-login" class="error-text hidden"></p>
      </div>
    </div>

    <!-- Main Screen (authenticated) -->
    <div id="main-screen" class="screen hidden">
      <div id="app">
        <!-- Player section -->
        <div id="player-section" class="hidden">
          <img id="artwork" src="" alt="Album artwork" />
          <div id="track-info">
            <h1 id="album-name"></h1>
            <h2 id="artist-name"></h2>
          </div>
          <div id="embed-container">
            <iframe
              id="apple-embed"
              allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
              frameborder="0"
              sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
              src=""
            ></iframe>
          </div>
          <div id="controls">
            <button id="shuffle-btn">Shuffle</button>
          </div>
        </div>

        <!-- Search bar -->
        <div id="search-bar">
          <input
            id="search-input"
            type="text"
            placeholder="Search albums..."
            autocomplete="off"
          />
          <select id="search-mode">
            <option value="library">Library</option>
            <option value="itunes">iTunes</option>
          </select>
        </div>

        <!-- Album grid -->
        <div id="album-grid"></div>

        <!-- Add button (URL paste) -->
        <button id="add-btn" title="Add album by URL">+</button>
        <div id="add-overlay" class="hidden">
          <div id="add-form">
            <input
              id="url-input"
              type="url"
              placeholder="Paste Apple Music URL..."
              autocomplete="off"
            />
            <button id="url-submit">Add</button>
            <button id="url-cancel">Cancel</button>
          </div>
          <p id="add-error" class="hidden"></p>
        </div>
      </div>
    </div>

    <script type="module" src="/src/client/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "refactor: restructure HTML with auth screens, search, and album grid"
```

---

## Task 13: Update CSS

Add styles for auth screens, search bar, album grid, and toggle.

**Files:**
- Modify: `src/client/style.css`

- [ ] **Step 1: Rewrite style.css**

Replace `src/client/style.css`:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #111;
  color: #fff;
  min-height: 100vh;
}

.hidden {
  display: none !important;
}

/* === Screens === */
.screen {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* === Auth === */
.auth-container {
  text-align: center;
  padding: 24px;
  max-width: 360px;
}

.auth-container h1 {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.auth-container p {
  color: #aaa;
  margin-bottom: 20px;
}

.auth-container input {
  width: 100%;
  padding: 12px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #222;
  color: #fff;
  font-size: 1rem;
  margin-bottom: 12px;
}

.btn-primary {
  width: 100%;
  background: #fa2d48;
  color: #fff;
  border: none;
  border-radius: 24px;
  padding: 14px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #e0263f;
}

.error-text {
  color: #fa2d48;
  font-size: 0.85rem;
  margin-top: 12px;
}

/* === Main App === */
#app {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

/* === Player === */
#player-section {
  text-align: center;
  margin-bottom: 24px;
}

#artwork {
  width: 100%;
  max-width: 360px;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 12px;
  margin-bottom: 16px;
  background: #222;
}

#track-info {
  margin-bottom: 16px;
}

#album-name {
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 4px;
}

#artist-name {
  font-size: 1rem;
  font-weight: 400;
  color: #aaa;
}

#embed-container {
  margin-bottom: 20px;
}

#apple-embed {
  width: 100%;
  max-width: 420px;
  height: 175px;
  border-radius: 12px;
  background: #222;
}

#controls {
  display: flex;
  justify-content: center;
  gap: 12px;
}

#shuffle-btn {
  background: #fa2d48;
  color: #fff;
  border: none;
  border-radius: 24px;
  padding: 12px 40px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

#shuffle-btn:hover {
  background: #e0263f;
}

/* === Search === */
#search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

#search-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #222;
  color: #fff;
  font-size: 0.95rem;
}

#search-input::placeholder {
  color: #666;
}

#search-mode {
  padding: 10px 14px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #222;
  color: #fff;
  font-size: 0.95rem;
  cursor: pointer;
}

/* === Album Grid === */
#album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}

.album-card {
  position: relative;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a1a;
  transition: transform 0.15s;
}

.album-card:hover {
  transform: scale(1.03);
}

.album-card-art {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}

.album-card-info {
  padding: 8px;
}

.album-card-name {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-card-artist {
  display: block;
  font-size: 0.75rem;
  color: #aaa;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-card-remove,
.album-card-add {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.album-card:hover .album-card-remove,
.album-card:hover .album-card-add {
  opacity: 1;
}

.album-card-remove {
  background: rgba(250, 45, 72, 0.9);
  color: #fff;
}

.album-card-add {
  background: rgba(50, 200, 80, 0.9);
  color: #fff;
}

/* === Add overlay === */
#add-btn {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: #333;
  color: #fff;
  font-size: 1.5rem;
  cursor: pointer;
  transition: background 0.2s;
  z-index: 5;
}

#add-btn:hover {
  background: #555;
}

#add-overlay {
  position: fixed;
  bottom: 80px;
  right: 24px;
  z-index: 10;
}

#add-form {
  display: flex;
  gap: 8px;
  background: #222;
  padding: 12px;
  border-radius: 12px;
}

#url-input {
  flex: 1;
  min-width: 220px;
  padding: 8px 12px;
  border: 1px solid #444;
  border-radius: 8px;
  background: #111;
  color: #fff;
  font-size: 0.9rem;
}

#url-submit,
#url-cancel {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}

#url-submit {
  background: #fa2d48;
  color: #fff;
}

#url-cancel {
  background: #444;
  color: #fff;
}

#add-error {
  color: #fa2d48;
  font-size: 0.85rem;
  margin-top: 8px;
  text-align: right;
}

.empty-message {
  grid-column: 1 / -1;
  text-align: center;
  color: #666;
  padding: 40px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/style.css
git commit -m "refactor: update styles for auth, search, and album grid"
```

---

## Task 14: Rewrite Main Entry Point

Wire everything together — auth gate, search, player, library.

**Files:**
- Modify: `src/client/main.ts`

- [ ] **Step 1: Rewrite main.ts**

Replace `src/client/main.ts`:

```typescript
import { checkAppState, register, login } from "./auth.js";
import { getLibrary, searchLibrary, addToLibrary, removeFromLibrary, getRandomItem } from "./library.js";
import { searchItunes, lookupAlbum, artworkUrl } from "./search.js";
import { parseAppleMusicUrl } from "./url-parser.js";
import { loadEmbed } from "./player.js";
import {
  showScreen,
  showPlayer,
  hidePlayer,
  getSetupUsername,
  showAuthError,
  hideAuthError,
  getSearchQuery,
  getSearchMode,
  renderAlbumGrid,
  renderItunesResults,
  showAddOverlay,
  hideAddOverlay,
  showAddError,
  getUrlInputValue,
} from "./ui.js";
import type { LibraryItem, ITunesAlbumResult } from "../shared/types.js";
import "./style.css";

const iframe = document.getElementById("apple-embed") as HTMLIFrameElement;
let debounceTimer: ReturnType<typeof setTimeout>;

// --- Auth ---

async function handleSetup(): Promise<void> {
  const username = getSetupUsername();
  if (!username) {
    showAuthError("Please enter a username");
    return;
  }
  try {
    hideAuthError();
    await register(username);
    await initMainScreen();
  } catch (err) {
    showAuthError(err instanceof Error ? err.message : "Registration failed");
  }
}

async function handleLogin(): Promise<void> {
  try {
    document.getElementById("auth-error-login")!.classList.add("hidden");
    await login();
    await initMainScreen();
  } catch (err) {
    const el = document.getElementById("auth-error-login")!;
    el.textContent = err instanceof Error ? err.message : "Login failed";
    el.classList.remove("hidden");
  }
}

// --- Main screen ---

async function initMainScreen(): Promise<void> {
  showScreen("main");
  await loadLibrary();
}

async function loadLibrary(): Promise<void> {
  const items = await getLibrary();
  renderAlbumGrid(items, playAlbum, handleRemove);
}

function playAlbum(item: LibraryItem): void {
  showPlayer(item);
  loadEmbed(iframe, item);
}

async function handleShuffle(): Promise<void> {
  const item = await getRandomItem();
  if (item) playAlbum(item);
}

async function handleRemove(item: LibraryItem): Promise<void> {
  await removeFromLibrary(item.id);
  await loadLibrary();
}

// --- Search ---

async function handleSearch(): Promise<void> {
  const query = getSearchQuery();
  const mode = getSearchMode();

  if (!query) {
    if (mode === "library") await loadLibrary();
    return;
  }

  if (mode === "library") {
    const items = await searchLibrary(query);
    renderAlbumGrid(items, playAlbum, handleRemove);
  } else {
    const results = await searchItunes(query);
    renderItunesResults(results, handleAddFromItunes);
  }
}

async function handleAddFromItunes(result: ITunesAlbumResult): Promise<void> {
  try {
    await addToLibrary({
      collection_id: result.collectionId,
      name: result.collectionName,
      artist_name: result.artistName,
      artwork_url: result.artworkUrl100,
      storefront: result.country?.toLowerCase() || "us",
      genre: result.primaryGenreName || null,
      release_date: result.releaseDate || null,
      url: null,
    });
  } catch (err) {
    // Silently handle duplicates
    console.warn("Add failed:", err);
  }
}

// --- Add by URL ---

async function handleAddByUrl(): Promise<void> {
  const url = getUrlInputValue();
  if (!url) return;

  const parsed = parseAppleMusicUrl(url);
  if (!parsed) {
    showAddError("Not a valid Apple Music album URL");
    return;
  }

  try {
    const album = await lookupAlbum(parsed.collectionId, parsed.storefront);
    if (!album) {
      showAddError("Album not found");
      return;
    }

    await addToLibrary({
      collection_id: album.collectionId,
      name: album.collectionName,
      artist_name: album.artistName,
      artwork_url: album.artworkUrl100,
      storefront: parsed.storefront,
      genre: album.primaryGenreName || null,
      release_date: album.releaseDate || null,
      url,
    });

    hideAddOverlay();
    if (getSearchMode() === "library") await loadLibrary();
  } catch (err) {
    showAddError(err instanceof Error ? err.message : "Failed to add");
  }
}

// --- Init ---

async function init(): Promise<void> {
  const state = await checkAppState();

  if (state === "setup") {
    showScreen("setup");
    document.getElementById("setup-btn")!.addEventListener("click", handleSetup);
    document.getElementById("setup-username")!.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSetup();
    });
  } else if (state === "login") {
    showScreen("login");
    document.getElementById("login-btn")!.addEventListener("click", handleLogin);
  } else {
    await initMainScreen();
  }

  // Main screen listeners (wired regardless of screen — elements exist in DOM)
  document.getElementById("shuffle-btn")!.addEventListener("click", handleShuffle);
  document.getElementById("add-btn")!.addEventListener("click", showAddOverlay);
  document.getElementById("url-cancel")!.addEventListener("click", hideAddOverlay);
  document.getElementById("url-submit")!.addEventListener("click", handleAddByUrl);
  document.getElementById("url-input")!.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAddByUrl();
    if (e.key === "Escape") hideAddOverlay();
  });

  // Search with debounce
  document.getElementById("search-input")!.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleSearch, 300);
  });
  document.getElementById("search-mode")!.addEventListener("change", handleSearch);
}

init();
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: Vite builds successfully to `dist/`.

- [ ] **Step 3: Commit**

```bash
git add src/client/main.ts
git commit -m "feat: rewrite main entry with auth gate, search, and Supabase integration"
```

---

## Task 15: Dockerfile and nginx Config

Create the production container setup for LKE deployment.

**Files:**
- Create: `Dockerfile`
- Create: `nginx.conf`
- Create: `.dockerignore`

- [ ] **Step 1: Create nginx.conf**

Create `nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

- [ ] **Step 2: Create Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine3.21
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 3: Create .dockerignore**

Create `.dockerignore`:

```
node_modules/
dist/
.git/
.env
k8s/
supabase/
docs/
tests/
*.md
```

- [ ] **Step 4: Test Docker build locally**

Run: `docker build -t pear-music:test .`
Expected: Builds successfully, two-stage image.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile nginx.conf .dockerignore
git commit -m "feat: add Dockerfile and nginx config for LKE deployment"
```

---

## Task 16: Woodpecker CI/CD Pipeline

Create the Woodpecker pipeline for building and deploying to LKE.

**Files:**
- Create: `.woodpecker.yml`

- [ ] **Step 1: Create pipeline config**

Create `.woodpecker.yml`:

```yaml
# =============================================================================
# Woodpecker CI Pipeline for Pear Music (static SPA)
# =============================================================================
# Branch: main - Build, push Docker image, auto-deploy to LKE
# =============================================================================

when:
  branch: [main, master]
  event: [push, manual]

variables:
  - &node_image node:22-alpine
  - &docker_image docker:24
  - &kubectl_image alpine/k8s:1.29.0

steps:
  # ---------------------------------------------------------------------------
  # Install dependencies and build
  # ---------------------------------------------------------------------------
  build:
    image: *node_image
    commands:
      - npm ci
      - npm run build

  # ---------------------------------------------------------------------------
  # Build and push Docker image
  # ---------------------------------------------------------------------------
  docker:
    image: *docker_image
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      DOCKER_REGISTRY:
        from_secret: docker_registry
      DOCKER_REGISTRY_USER:
        from_secret: docker_registry_user
      DOCKER_REGISTRY_PASSWORD:
        from_secret: docker_registry_password
    commands:
      - docker login -u "$DOCKER_REGISTRY_USER" -p "$DOCKER_REGISTRY_PASSWORD" "$DOCKER_REGISTRY"
      - docker build -t "$DOCKER_REGISTRY/pear-music:$(date +%Y%m%d)-${CI_PIPELINE_NUMBER}" -t "$DOCKER_REGISTRY/pear-music:latest" -f Dockerfile .
      - docker push "$DOCKER_REGISTRY/pear-music:$(date +%Y%m%d)-${CI_PIPELINE_NUMBER}"
      - docker push "$DOCKER_REGISTRY/pear-music:latest"
    depends_on: [build]

  # ---------------------------------------------------------------------------
  # Deploy to LKE
  # ---------------------------------------------------------------------------
  deploy:
    image: *kubectl_image
    environment:
      HOME: /tmp
      KUBECONFIG_SECRET:
        from_secret: kubeconfig
      DOCKER_REGISTRY:
        from_secret: docker_registry
    commands:
      - mkdir -p /tmp/.kube
      - echo "$KUBECONFIG_SECRET" > /tmp/.kube/config
      - chmod 600 /tmp/.kube/config
      - kubectl --kubeconfig=/tmp/.kube/config set image deployment/pear-music web="$DOCKER_REGISTRY/pear-music:$(date +%Y%m%d)-${CI_PIPELINE_NUMBER}" -n mltru-com
      - kubectl --kubeconfig=/tmp/.kube/config rollout status deployment/pear-music -n mltru-com --timeout=120s
    depends_on: [docker]

# =============================================================================
# Required Secrets (configure in Woodpecker UI)
# =============================================================================
# docker_registry          - Synology registry URL
# docker_registry_user     - Registry username
# docker_registry_password - Registry password
# kubeconfig               - Kubeconfig for LKE cluster
# =============================================================================
```

- [ ] **Step 2: Commit**

```bash
git add .woodpecker.yml
git commit -m "feat: add Woodpecker CI/CD pipeline for LKE deployment"
```

---

## Task 17: Kubernetes Manifests (Local Only)

Create the k8s manifests in the gitignored `k8s/` directory.

**Files:**
- Create: `k8s/deployment.yaml`
- Create: `k8s/service.yaml`
- Create: `k8s/ingress.yaml`

- [ ] **Step 1: Create k8s directory and deployment**

```bash
mkdir -p k8s
```

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pear-music
  namespace: mltru-com
spec:
  replicas: 1
  selector:
    matchLabels:
      app: pear-music
  template:
    metadata:
      labels:
        app: pear-music
    spec:
      imagePullSecrets:
        - name: registry-credentials
      containers:
        - name: web
          image: registry.dala-triceratops.ts.net/pear-music:latest
          ports:
            - containerPort: 80
          resources:
            requests:
              memory: "32Mi"
              cpu: "10m"
            limits:
              memory: "64Mi"
              cpu: "50m"
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 10
```

- [ ] **Step 2: Create service**

Create `k8s/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: pear-music
  namespace: mltru-com
spec:
  selector:
    app: pear-music
  ports:
    - port: 80
      targetPort: 80
```

- [ ] **Step 3: Create ingress**

Create `k8s/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pear-music
  namespace: mltru-com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - music.mltru.com
      secretName: pear-music-tls
  rules:
    - host: music.mltru.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: pear-music
                port:
                  number: 80
```

- [ ] **Step 4: Apply manifests to cluster**

Run (manually, not in CI):
```bash
kubectl apply -f k8s/
```
Expected: deployment, service, and ingress created in `mltru-com` namespace.

- [ ] **Step 5: No git commit** — k8s/ is gitignored.

---

## Task 18: Supabase Project Setup (Manual Steps)

These steps must be done by the user in the Supabase dashboard and CLI.

- [ ] **Step 1: Create Supabase project**

Go to [supabase.com/dashboard](https://supabase.com/dashboard):
1. Create new project (free tier)
2. Choose a name (e.g. "pear-music") and region
3. Note down: Project URL, anon key, service role key, JWT secret

- [ ] **Step 2: Run the schema migration**

In Supabase SQL Editor, paste and run the contents of `supabase/migrations/001_schema.sql`.

- [ ] **Step 3: Configure Edge Function secrets**

Via Supabase dashboard → Edge Functions → Secrets, set:
- `WEBAUTHN_RP_ID` = `music.mltru.com`
- `WEBAUTHN_ORIGIN` = `https://music.mltru.com`
- `SUPABASE_JWT_SECRET` = (from project settings → API → JWT Secret)

- [ ] **Step 4: Deploy Edge Functions**

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy auth
npx supabase functions deploy metadata
```

- [ ] **Step 5: Update local .env**

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

- [ ] **Step 6: Set env vars in Woodpecker CI**

In Woodpecker secrets, add:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then update the build step in `.woodpecker.yml` to pass them:

```yaml
  build:
    image: *node_image
    environment:
      VITE_SUPABASE_URL:
        from_secret: supabase_url
      VITE_SUPABASE_ANON_KEY:
        from_secret: supabase_anon_key
    commands:
      - npm ci
      - npm run build
```

---

## Task 19: Supabase Local Config

Create the Supabase local config for development and function deployment.

**Files:**
- Create: `supabase/config.toml`

- [ ] **Step 1: Create config.toml**

Create `supabase/config.toml`:

```toml
[project]
id = "pear-music"

[functions.auth]
verify_jwt = false

[functions.metadata]
verify_jwt = false
```

Note: `verify_jwt = false` because we handle JWT verification ourselves in the auth function (we mint custom JWTs, not Supabase Auth JWTs). The metadata function is called with the user's token but doesn't strictly require auth since it just proxies iTunes.

- [ ] **Step 2: Commit**

```bash
git add supabase/config.toml
git commit -m "feat: add Supabase local config"
```

---

## Task 20: End-to-End Smoke Test

Verify the full flow works locally.

- [ ] **Step 1: Start local dev server**

Run: `npm run dev`
Expected: Vite dev server starts on http://localhost:5173

- [ ] **Step 2: Test setup flow**

1. Open http://localhost:5173
2. Should see "Welcome to Pear Music" setup screen
3. Enter username, click "Register with Passkey"
4. Complete biometric prompt
5. Should redirect to main screen with empty library

- [ ] **Step 3: Test iTunes search**

1. Switch search mode to "iTunes"
2. Type "radiohead"
3. Should see album results with artwork
4. Click "+" on an album
5. Switch back to "Library" mode — album should appear

- [ ] **Step 4: Test URL paste add**

1. Click "+" button (bottom right)
2. Paste: `https://music.apple.com/us/album/ok-computer/1097861387`
3. Click "Add"
4. Album should appear in library grid

- [ ] **Step 5: Test playback**

1. Click an album in the grid
2. Embed player should load with the album
3. Click "Shuffle" — should switch to random album

- [ ] **Step 6: Test login persistence**

1. Close the tab
2. Re-open http://localhost:5173
3. Should see "Sign in with Passkey" (not setup)
4. Authenticate — should show library with previously added albums
