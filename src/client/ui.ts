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

export function clearSearchInput(): void {
  ($("search-input") as HTMLInputElement).value = "";
}

export function showSearchStatus(message: string, isError = false): void {
  const el = $("search-status");
  el.textContent = message;
  el.className = isError ? "search-status error" : "search-status success";
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

// --- Home grid (featured + random) ---

export function renderHomeGrid(
  items: LibraryItem[],
  onPlay: (item: LibraryItem) => void
): void {
  const grid = $("album-grid");
  grid.innerHTML = "";

  if (items.length === 0) {
    grid.innerHTML = '<p class="empty-message">No albums yet. Switch to iTunes to search and add albums.</p>';
    return;
  }

  const [featured, ...rest] = items;

  // Featured card (shuffle pick, larger)
  const featuredCard = document.createElement("div");
  featuredCard.className = "album-card album-card-featured";
  featuredCard.innerHTML = `
    <span class="featured-label">Shuffle Pick</span>
    <img src="${artworkUrl(featured.artwork_url, 600)}" alt="${featured.name}" class="album-card-art" />
    <div class="album-card-info">
      <span class="album-card-name">${featured.name}</span>
      <span class="album-card-artist">${featured.artist_name}</span>
    </div>
  `;
  featuredCard.addEventListener("click", () => onPlay(featured));
  grid.appendChild(featuredCard);

  // Remaining cards
  for (const item of rest) {
    const card = document.createElement("div");
    card.className = "album-card";
    card.innerHTML = `
      <img src="${artworkUrl(item.artwork_url, 300)}" alt="${item.name}" class="album-card-art" />
      <div class="album-card-info">
        <span class="album-card-name">${item.name}</span>
        <span class="album-card-artist">${item.artist_name}</span>
      </div>
    `;
    card.addEventListener("click", () => onPlay(item));
    grid.appendChild(card);
  }
}

// --- Album grid (search results) ---

export function renderAlbumGrid(
  items: LibraryItem[],
  onPlay: (item: LibraryItem) => void,
  onRemove: (item: LibraryItem) => void
): void {
  const grid = $("album-grid");
  grid.innerHTML = "";

  if (items.length === 0) {
    grid.innerHTML = '<p class="empty-message">No albums yet. Switch to iTunes to search and add albums.</p>';
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
      <button class="album-card-remove" title="Remove">\u2212</button>
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
      (e.target as HTMLButtonElement).textContent = "\u2713";
      (e.target as HTMLButtonElement).disabled = true;
    });
    grid.appendChild(card);
  }
}
