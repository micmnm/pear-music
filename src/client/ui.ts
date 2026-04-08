import type { LibraryItem, ITunesAlbumResult } from "../shared/types.js";
import { artworkUrl } from "./search.js";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

// --- Screen management ---

export type Screen = "signup" | "login" | "waitlist" | "rejected" | "main" | "admin";

export function showScreen(screen: Screen): void {
  const screens: Screen[] = ["signup", "login", "waitlist", "rejected", "main", "admin"];
  for (const s of screens) {
    $(`${s}-screen`).classList.toggle("hidden", s !== screen);
  }
}

// --- Auth UI ---

export function getSignupEmail(): string {
  return ($("signup-email") as HTMLInputElement).value.trim();
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
  onPlay: (item: LibraryItem) => void,
  onShuffle: () => void
): void {
  const grid = $("album-grid");
  grid.innerHTML = "";

  if (items.length === 0) {
    grid.innerHTML = '<p class="empty-message">No albums yet. Switch to iTunes to search and add albums.</p>';
    return;
  }

  // Shuffle card — picks a new random album on every click
  const shuffleCard = document.createElement("div");
  shuffleCard.className = "album-card album-card-blind";
  shuffleCard.innerHTML = `
    <div class="blind-art">
      <span class="blind-icon">&#9654;</span>
      <span class="blind-text">Shuffle</span>
    </div>
  `;
  shuffleCard.addEventListener("click", onShuffle);
  grid.appendChild(shuffleCard);

  // Album cards (skip first — shuffle card takes its slot)
  for (const item of items.slice(1)) {
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

// --- Pending banner / admin link in main header ---

export function showAdminLink(visible: boolean): void {
  $("admin-link").classList.toggle("hidden", !visible);
}

export function showPendingBanner(count: number): void {
  const banner = $("pending-banner");
  if (count <= 0) {
    banner.classList.add("hidden");
    return;
  }
  banner.textContent = `${count} user${count === 1 ? "" : "s"} waiting for approval`;
  banner.classList.remove("hidden");
}

// --- Signup screen helpers ---

export function showSignupSlots(active: number, max: number): void {
  $("signup-slots").textContent = `${active} / ${max} slots filled`;
}

// --- Admin screen helpers ---

export function setAdminCapacity(active: number, max: number): void {
  $("admin-capacity").textContent = `Currently active: ${active} / ${max}`;
}

export function setAdminMaxInput(max: number): void {
  ($("admin-max-input") as HTMLInputElement).value = String(max);
}

export function getAdminMaxInput(): number {
  return parseInt(($("admin-max-input") as HTMLInputElement).value, 10);
}

export function showAdminPendingBanner(count: number): void {
  const banner = $("admin-pending-banner");
  if (count <= 0) {
    banner.classList.add("hidden");
    return;
  }
  ($("admin-pending-count")).textContent = `${count} user${count === 1 ? "" : "s"} waiting for approval`;
  banner.classList.remove("hidden");
}

export interface AdminUserRowView {
  id: string;
  email: string;
  status: "pending_approval" | "active" | "rejected";
  is_admin: boolean;
  created_at: string;
  album_count: number;
}

export function renderAdminUsers(
  rows: AdminUserRowView[],
  handlers: {
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onDelete: (id: string) => void;
  }
): void {
  const tbody = $("admin-users-tbody");
  tbody.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");

    const adminBadge = row.is_admin ? " ★" : "";
    tr.innerHTML = `
      <td>${escapeHtml(row.email)}${adminBadge}</td>
      <td>${row.status}</td>
      <td>${new Date(row.created_at).toISOString().slice(0, 10)}</td>
      <td>${row.album_count}</td>
      <td class="admin-actions"></td>
    `;

    const actions = tr.querySelector(".admin-actions")!;

    if (row.status === "pending_approval") {
      const approve = document.createElement("button");
      approve.textContent = "Approve";
      approve.className = "btn-secondary";
      approve.addEventListener("click", () => handlers.onApprove(row.id));
      actions.appendChild(approve);

      const reject = document.createElement("button");
      reject.textContent = "Reject";
      reject.className = "btn-secondary";
      reject.addEventListener("click", () => handlers.onReject(row.id));
      actions.appendChild(reject);
    } else if (row.status === "active" && !row.is_admin) {
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.className = "btn-secondary";
      del.addEventListener("click", () => {
        if (confirm(`Delete ${row.email}? This is permanent.`)) {
          handlers.onDelete(row.id);
        }
      });
      actions.appendChild(del);
    }

    tbody.appendChild(tr);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
