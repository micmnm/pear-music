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

  // Main screen listeners (wired regardless of screen -- elements exist in DOM)
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
