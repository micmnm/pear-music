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
