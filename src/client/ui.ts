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
