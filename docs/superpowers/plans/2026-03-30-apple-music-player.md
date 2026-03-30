# Apple Music Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page web app that shuffles and plays curated Apple Music albums/playlists via the Apple Music embed player.

**Architecture:** Express backend serves a Vite-built frontend and exposes API endpoints for library CRUD and shuffle. Library is persisted as a JSON file on disk. Playback is delegated to Apple's embed iframe. Metadata is fetched by scraping OG tags from Apple Music URLs.

**Tech Stack:** Vite, vanilla TypeScript, Express, Vitest, node-html-parser (for OG tag scraping)

---

## File Map

```
package.json                — project config, scripts
tsconfig.json               — base TS config
tsconfig.server.json        — server TS config (Node target)
vite.config.ts              — Vite config for client build
index.html                  — Vite entry HTML
src/
  shared/
    types.ts                — LibraryItem interface, shared between client and server
  client/
    main.ts                 — app entry, initializes UI and event listeners
    player.ts               — manages Apple Music embed iframe
    api.ts                  — fetch wrappers for backend API
    ui.ts                   — DOM manipulation helpers
    style.css               — styles
  server/
    index.ts                — Express server entry
    routes.ts               — API route handlers
    apple.ts                — URL parsing + OG tag metadata fetching
    library.ts              — read/write data/library.json
data/
  library.json              — curated list (starts as empty { "items": [] })
tests/
  server/
    apple.test.ts           — URL parsing + metadata tests
    library.test.ts         — library read/write tests
    routes.test.ts          — API endpoint integration tests
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`, `.gitignore`, `data/library.json`

- [ ] **Step 1: Initialize npm and install dependencies**

```bash
npm init -y
npm install express
npm install -D typescript vite vitest @types/express @types/node tsx concurrently node-html-parser supertest @types/supertest
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `tsconfig.server.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist/server",
    "rootDir": "src/server"
  },
  "include": ["src/server/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist/client",
    emptyDirOnBuild: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
```

- [ ] **Step 5: Add scripts to `package.json`**

Add to `package.json`:
```json
{
  "type": "module",
  "scripts": {
    "dev:client": "vite",
    "dev:server": "tsx watch src/server/index.ts",
    "dev": "concurrently \"npm run dev:client\" \"npm run dev:server\"",
    "build": "vite build && tsc -p tsconfig.server.json",
    "start": "node dist/server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 7: Create empty library**

Create `data/library.json`:
```json
{
  "items": []
}
```

- [ ] **Step 8: Verify setup compiles**

Run: `npx tsc --noEmit`
Expected: No errors (no source files yet, should pass cleanly)

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.server.json vite.config.ts .gitignore data/library.json
git commit -m "chore: scaffold project with Vite, Express, TypeScript"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create `src/shared/types.ts`**

```ts
export interface LibraryItem {
  id: string;
  type: "album" | "playlist";
  name: string;
  artistName: string | null;
  artworkUrl: string;
  url: string;
}

export interface Library {
  items: LibraryItem[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared types for LibraryItem and Library"
```

---

### Task 3: Library Module (read/write JSON)

**Files:**
- Create: `src/server/library.ts`, `tests/server/library.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/library.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readLibrary, writeLibrary } from "../../src/server/library.js";
import { Library } from "../../src/shared/types.js";
import fs from "node:fs";
import path from "node:path";

const TEST_PATH = path.join("data", "library.test.json");

describe("library", () => {
  beforeEach(() => {
    fs.writeFileSync(TEST_PATH, JSON.stringify({ items: [] }));
  });

  afterEach(() => {
    if (fs.existsSync(TEST_PATH)) fs.unlinkSync(TEST_PATH);
  });

  it("reads an empty library", async () => {
    const lib = await readLibrary(TEST_PATH);
    expect(lib).toEqual({ items: [] });
  });

  it("writes and reads back an item", async () => {
    const lib: Library = {
      items: [
        {
          id: "123",
          type: "album",
          name: "Test Album",
          artistName: "Test Artist",
          artworkUrl: "https://example.com/art.jpg",
          url: "https://music.apple.com/us/album/test/123",
        },
      ],
    };
    await writeLibrary(TEST_PATH, lib);
    const result = await readLibrary(TEST_PATH);
    expect(result).toEqual(lib);
  });

  it("creates file if it does not exist", async () => {
    if (fs.existsSync(TEST_PATH)) fs.unlinkSync(TEST_PATH);
    const lib = await readLibrary(TEST_PATH);
    expect(lib).toEqual({ items: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/library.test.ts`
Expected: FAIL — cannot import `readLibrary`

- [ ] **Step 3: Write implementation**

Create `src/server/library.ts`:

```ts
import fs from "node:fs/promises";
import { Library } from "../shared/types.js";

export async function readLibrary(filePath: string): Promise<Library> {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as Library;
  } catch {
    const empty: Library = { items: [] };
    await writeLibrary(filePath, empty);
    return empty;
  }
}

export async function writeLibrary(
  filePath: string,
  library: Library
): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(library, null, 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/library.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/library.ts tests/server/library.test.ts
git commit -m "feat: add library read/write module with tests"
```

---

### Task 4: Apple Music URL Parsing & Metadata Fetching

**Files:**
- Create: `src/server/apple.ts`, `tests/server/apple.test.ts`

- [ ] **Step 1: Write the failing tests for URL parsing**

Create `tests/server/apple.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAppleMusicUrl } from "../../src/server/apple.js";

describe("parseAppleMusicUrl", () => {
  it("parses an album URL", () => {
    const result = parseAppleMusicUrl(
      "https://music.apple.com/us/album/in-rainbows/1109714933"
    );
    expect(result).toEqual({
      type: "album",
      id: "1109714933",
      storefront: "us",
    });
  });

  it("parses a playlist URL", () => {
    const result = parseAppleMusicUrl(
      "https://music.apple.com/us/playlist/chill-vibes/pl.abc123"
    );
    expect(result).toEqual({
      type: "playlist",
      id: "pl.abc123",
      storefront: "us",
    });
  });

  it("parses a URL with query params", () => {
    const result = parseAppleMusicUrl(
      "https://music.apple.com/gb/album/ok-computer/1097861387?l=en"
    );
    expect(result).toEqual({
      type: "album",
      id: "1097861387",
      storefront: "gb",
    });
  });

  it("returns null for invalid URL", () => {
    const result = parseAppleMusicUrl("https://example.com/not-apple");
    expect(result).toBeNull();
  });

  it("returns null for non-album/playlist URL", () => {
    const result = parseAppleMusicUrl(
      "https://music.apple.com/us/artist/radiohead/657515"
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/apple.test.ts`
Expected: FAIL — cannot import `parseAppleMusicUrl`

- [ ] **Step 3: Write URL parsing implementation**

Create `src/server/apple.ts`:

```ts
import { parse as parseHtml } from "node-html-parser";
import { LibraryItem } from "../shared/types.js";

interface ParsedUrl {
  type: "album" | "playlist";
  id: string;
  storefront: string;
}

export function parseAppleMusicUrl(url: string): ParsedUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== "music.apple.com") return null;

  // Path: /{storefront}/{type}/{slug}/{id}
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 4) return null;

  const [storefront, type, , id] = segments;

  if (type !== "album" && type !== "playlist") return null;

  return { type, id, storefront };
}

export async function fetchMetadata(url: string): Promise<LibraryItem | null> {
  const parsed = parseAppleMusicUrl(url);
  if (!parsed) return null;

  const response = await fetch(url);
  if (!response.ok) return null;

  const html = await response.text();
  const root = parseHtml(html);

  const ogTitle =
    root
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content") ?? "Unknown";
  const ogImage =
    root
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content") ?? "";

  // For albums, OG title is typically "Album Name by Artist"
  let name = ogTitle;
  let artistName: string | null = null;

  if (parsed.type === "album") {
    const byIndex = ogTitle.lastIndexOf(" by ");
    if (byIndex !== -1) {
      name = ogTitle.substring(0, byIndex);
      artistName = ogTitle.substring(byIndex + 4);
    }
  }

  return {
    id: parsed.id,
    type: parsed.type,
    name,
    artistName,
    artworkUrl: ogImage,
    url,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server/apple.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Add test for fetchMetadata with mocked fetch**

Add to `tests/server/apple.test.ts`:

```ts
import { fetchMetadata } from "../../src/server/apple.js";
import { vi } from "vitest";

describe("fetchMetadata", () => {
  it("fetches and parses OG tags for an album", async () => {
    const mockHtml = `
      <html><head>
        <meta property="og:title" content="In Rainbows by Radiohead">
        <meta property="og:image" content="https://is1-ssl.mzstatic.com/image/art.jpg">
      </head></html>
    `;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      })
    );

    const result = await fetchMetadata(
      "https://music.apple.com/us/album/in-rainbows/1109714933"
    );
    expect(result).toEqual({
      id: "1109714933",
      type: "album",
      name: "In Rainbows",
      artistName: "Radiohead",
      artworkUrl: "https://is1-ssl.mzstatic.com/image/art.jpg",
      url: "https://music.apple.com/us/album/in-rainbows/1109714933",
    });

    vi.restoreAllMocks();
  });

  it("fetches and parses OG tags for a playlist", async () => {
    const mockHtml = `
      <html><head>
        <meta property="og:title" content="Chill Vibes">
        <meta property="og:image" content="https://is1-ssl.mzstatic.com/image/playlist.jpg">
      </head></html>
    `;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      })
    );

    const result = await fetchMetadata(
      "https://music.apple.com/us/playlist/chill-vibes/pl.abc123"
    );
    expect(result).toEqual({
      id: "pl.abc123",
      type: "playlist",
      name: "Chill Vibes",
      artistName: null,
      artworkUrl: "https://is1-ssl.mzstatic.com/image/playlist.jpg",
      url: "https://music.apple.com/us/playlist/chill-vibes/pl.abc123",
    });

    vi.restoreAllMocks();
  });

  it("returns null for invalid URL", async () => {
    const result = await fetchMetadata("https://example.com/not-apple");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 6: Run all apple tests**

Run: `npx vitest run tests/server/apple.test.ts`
Expected: 8 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/apple.ts tests/server/apple.test.ts
git commit -m "feat: add Apple Music URL parsing and OG metadata fetching"
```

---

### Task 5: API Routes

**Files:**
- Create: `src/server/routes.ts`, `tests/server/routes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/server/routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createRoutes } from "../../src/server/routes.js";
import fs from "node:fs";
import path from "node:path";

const TEST_PATH = path.join("data", "library.routes-test.json");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", createRoutes(TEST_PATH));
  return app;
}

describe("API routes", () => {
  beforeEach(() => {
    fs.writeFileSync(TEST_PATH, JSON.stringify({ items: [] }));
  });

  afterEach(() => {
    if (fs.existsSync(TEST_PATH)) fs.unlinkSync(TEST_PATH);
    vi.restoreAllMocks();
  });

  describe("GET /api/library", () => {
    it("returns empty library", async () => {
      const res = await request(createApp()).get("/api/library");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
    });

    it("returns library with items", async () => {
      const lib = {
        items: [
          {
            id: "123",
            type: "album",
            name: "Test",
            artistName: "Artist",
            artworkUrl: "https://example.com/art.jpg",
            url: "https://music.apple.com/us/album/test/123",
          },
        ],
      };
      fs.writeFileSync(TEST_PATH, JSON.stringify(lib));
      const res = await request(createApp()).get("/api/library");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(lib);
    });
  });

  describe("POST /api/library", () => {
    it("returns 400 for missing url", async () => {
      const res = await request(createApp())
        .post("/api/library")
        .send({});
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid Apple Music URL", async () => {
      const res = await request(createApp())
        .post("/api/library")
        .send({ url: "https://example.com/not-apple" });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/library/:id", () => {
    it("deletes an item by id", async () => {
      const lib = {
        items: [
          {
            id: "123",
            type: "album",
            name: "Test",
            artistName: "Artist",
            artworkUrl: "https://example.com/art.jpg",
            url: "https://music.apple.com/us/album/test/123",
          },
        ],
      };
      fs.writeFileSync(TEST_PATH, JSON.stringify(lib));
      const res = await request(createApp()).delete("/api/library/123");
      expect(res.status).toBe(200);

      const after = await request(createApp()).get("/api/library");
      expect(after.body.items).toHaveLength(0);
    });

    it("returns 404 for non-existent id", async () => {
      const res = await request(createApp()).delete("/api/library/999");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/shuffle", () => {
    it("returns 404 when library is empty", async () => {
      const res = await request(createApp()).get("/api/shuffle");
      expect(res.status).toBe(404);
    });

    it("returns a random item", async () => {
      const item = {
        id: "123",
        type: "album",
        name: "Test",
        artistName: "Artist",
        artworkUrl: "https://example.com/art.jpg",
        url: "https://music.apple.com/us/album/test/123",
      };
      fs.writeFileSync(TEST_PATH, JSON.stringify({ items: [item] }));
      const res = await request(createApp()).get("/api/shuffle");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(item);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/routes.test.ts`
Expected: FAIL — cannot import `createRoutes`

- [ ] **Step 3: Write implementation**

Create `src/server/routes.ts`:

```ts
import { Router } from "express";
import { readLibrary, writeLibrary } from "./library.js";
import { fetchMetadata } from "./apple.js";

export function createRoutes(libraryPath: string): Router {
  const router = Router();

  router.get("/library", async (_req, res) => {
    const library = await readLibrary(libraryPath);
    res.json(library);
  });

  router.post("/library", async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing url" });
      return;
    }

    const item = await fetchMetadata(url);
    if (!item) {
      res.status(400).json({ error: "Invalid Apple Music URL or failed to fetch metadata" });
      return;
    }

    const library = await readLibrary(libraryPath);
    const exists = library.items.some((i) => i.id === item.id);
    if (exists) {
      res.status(409).json({ error: "Item already exists" });
      return;
    }

    library.items.push(item);
    await writeLibrary(libraryPath, library);
    res.status(201).json(item);
  });

  router.delete("/library/:id", async (req, res) => {
    const library = await readLibrary(libraryPath);
    const index = library.items.findIndex((i) => i.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    library.items.splice(index, 1);
    await writeLibrary(libraryPath, library);
    res.json({ ok: true });
  });

  router.get("/shuffle", async (_req, res) => {
    const library = await readLibrary(libraryPath);
    if (library.items.length === 0) {
      res.status(404).json({ error: "Library is empty" });
      return;
    }

    const index = Math.floor(Math.random() * library.items.length);
    res.json(library.items[index]);
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server/routes.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes.ts tests/server/routes.test.ts
git commit -m "feat: add API routes for library CRUD and shuffle"
```

---

### Task 6: Express Server Entry

**Files:**
- Create: `src/server/index.ts`

- [ ] **Step 1: Create `src/server/index.ts`**

```ts
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRoutes } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const LIBRARY_PATH = path.resolve(__dirname, "../../data/library.json");

const app = express();
app.use(express.json());
app.use("/api", createRoutes(LIBRARY_PATH));

// Serve static frontend in production
const clientDist = path.resolve(__dirname, "../client");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Verify server starts**

Run: `npx tsx src/server/index.ts &` then `curl http://localhost:3000/api/library` then kill the server.
Expected: `{"items":[]}`

- [ ] **Step 3: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: add Express server entry point"
```

---

### Task 7: Frontend — HTML Shell & Styles

**Files:**
- Create: `index.html`, `src/client/style.css`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Apple Music Player</title>
    <link rel="stylesheet" href="/src/client/style.css" />
  </head>
  <body>
    <div id="app">
      <div id="empty-state" class="hidden">
        <p>No albums yet. Add one to get started!</p>
      </div>

      <div id="player-view" class="hidden">
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

      <button id="add-btn" title="Add album or playlist">+</button>
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
    <script type="module" src="/src/client/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/client/style.css`**

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
  display: flex;
  justify-content: center;
  align-items: center;
}

#app {
  width: 100%;
  max-width: 420px;
  padding: 24px;
  text-align: center;
  position: relative;
}

.hidden {
  display: none !important;
}

/* Artwork */
#artwork {
  width: 100%;
  max-width: 360px;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 12px;
  margin-bottom: 16px;
  background: #222;
}

/* Track info */
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

/* Embed */
#embed-container {
  margin-bottom: 20px;
}

#apple-embed {
  width: 100%;
  height: 175px;
  border-radius: 12px;
  background: #222;
}

/* Controls */
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

/* Add button */
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
}

#add-btn:hover {
  background: #555;
}

/* Add overlay */
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

/* Empty state */
#empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #888;
  font-size: 1.1rem;
}
```

- [ ] **Step 3: Verify Vite serves the page**

Run: `npx vite --open`
Expected: Browser opens, shows empty dark page (no JS yet)

- [ ] **Step 4: Commit**

```bash
git add index.html src/client/style.css
git commit -m "feat: add HTML shell and styles for player UI"
```

---

### Task 8: Frontend — API Client

**Files:**
- Create: `src/client/api.ts`

- [ ] **Step 1: Create `src/client/api.ts`**

```ts
import type { Library, LibraryItem } from "../shared/types.js";

const BASE = "/api";

export async function getLibrary(): Promise<Library> {
  const res = await fetch(`${BASE}/library`);
  if (!res.ok) throw new Error("Failed to fetch library");
  return res.json();
}

export async function addItem(url: string): Promise<LibraryItem> {
  const res = await fetch(`${BASE}/library`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to add item");
  }
  return res.json();
}

export async function deleteItem(id: string): Promise<void> {
  const res = await fetch(`${BASE}/library/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete item");
}

export async function shuffle(): Promise<LibraryItem> {
  const res = await fetch(`${BASE}/shuffle`);
  if (!res.ok) throw new Error("Library is empty");
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/api.ts
git commit -m "feat: add frontend API client"
```

---

### Task 9: Frontend — Player Module

**Files:**
- Create: `src/client/player.ts`

- [ ] **Step 1: Create `src/client/player.ts`**

```ts
import type { LibraryItem } from "../shared/types.js";

const EMBED_BASE = "https://embed.music.apple.com";

export function buildEmbedUrl(item: LibraryItem): string {
  // Embed URL format: https://embed.music.apple.com/{storefront}/{type}/{id}
  // Extract storefront from the item's Apple Music URL
  let storefront = "us";
  try {
    const url = new URL(item.url);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0) storefront = segments[0];
  } catch {
    // fall back to "us"
  }

  return `${EMBED_BASE}/${storefront}/${item.type}/${item.id}`;
}

export function loadEmbed(iframe: HTMLIFrameElement, item: LibraryItem): void {
  iframe.src = buildEmbedUrl(item);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/player.ts
git commit -m "feat: add player module for embed iframe management"
```

---

### Task 10: Frontend — UI Module

**Files:**
- Create: `src/client/ui.ts`

- [ ] **Step 1: Create `src/client/ui.ts`**

```ts
import type { LibraryItem } from "../shared/types.js";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

export function showPlayerView(item: LibraryItem): void {
  $("empty-state").classList.add("hidden");
  $("player-view").classList.remove("hidden");

  ($("artwork") as HTMLImageElement).src = item.artworkUrl;
  $("album-name").textContent = item.name;
  $("artist-name").textContent = item.artistName ?? "";
}

export function showEmptyState(): void {
  $("empty-state").classList.remove("hidden");
  $("player-view").classList.add("hidden");
}

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
git commit -m "feat: add UI module for DOM manipulation"
```

---

### Task 11: Frontend — Main Entry (Wire Everything Together)

**Files:**
- Create: `src/client/main.ts`

- [ ] **Step 1: Create `src/client/main.ts`**

```ts
import { getLibrary, addItem, shuffle } from "./api.js";
import { loadEmbed } from "./player.js";
import {
  showPlayerView,
  showEmptyState,
  showAddOverlay,
  hideAddOverlay,
  showAddError,
  getUrlInputValue,
} from "./ui.js";
import "./style.css";

const iframe = document.getElementById("apple-embed") as HTMLIFrameElement;

async function playShuffle(): Promise<void> {
  try {
    const item = await shuffle();
    showPlayerView(item);
    loadEmbed(iframe, item);
  } catch {
    // Library might be empty — ignore
  }
}

async function handleAdd(): Promise<void> {
  const url = getUrlInputValue();
  if (!url) return;

  try {
    await addItem(url);
    hideAddOverlay();
    // If this is the first item, auto-shuffle to start playing
    await playShuffle();
  } catch (err) {
    showAddError(err instanceof Error ? err.message : "Failed to add");
  }
}

async function init(): Promise<void> {
  // Wire up event listeners
  document.getElementById("shuffle-btn")!.addEventListener("click", playShuffle);
  document.getElementById("add-btn")!.addEventListener("click", showAddOverlay);
  document.getElementById("url-cancel")!.addEventListener("click", hideAddOverlay);
  document.getElementById("url-submit")!.addEventListener("click", handleAdd);
  document.getElementById("url-input")!.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAdd();
    if (e.key === "Escape") hideAddOverlay();
  });

  // Load initial state
  const library = await getLibrary();
  if (library.items.length === 0) {
    showEmptyState();
  } else {
    await playShuffle();
  }
}

init();
```

- [ ] **Step 2: Run full dev stack and test manually**

Run: `npm run dev`
Expected: Vite dev server on :5173, Express on :3000. Open browser, see empty state. Click `+`, paste an Apple Music album URL, submit. Album appears with embed player. Click shuffle.

- [ ] **Step 3: Commit**

```bash
git add src/client/main.ts
git commit -m "feat: wire up frontend — main entry with shuffle, add, and playback"
```

---

### Task 12: Run All Tests & Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (library, apple, routes)

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: Vite builds client to `dist/client/`, tsc compiles server to `dist/server/`

- [ ] **Step 3: Test production mode**

Run: `npm run start`
Then open `http://localhost:3000` in browser.
Expected: App loads, same behavior as dev mode.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify build and tests pass"
```
