import { checkAppState, register, login } from "./auth.js";
import { getLibrary, searchLibrary, addToLibrary, removeFromLibrary, getRandomItem, getRandomItems } from "./library.js";
import { searchItunes, lookupAlbum } from "./search.js";
import { parseAppleMusicUrl } from "./url-parser.js";
import { loadEmbed } from "./player.js";
import {
  showScreen,
  showPlayer,
  getSetupUsername,
  showAuthError,
  hideAuthError,
  getSearchQuery,
  getSearchMode,
  clearSearchInput,
  showSearchStatus,
  renderHomeGrid,
  renderAlbumGrid,
  renderItunesResults,
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
  await loadHome();
}

async function loadHome(): Promise<void> {
  const items = await getRandomItems(10);
  renderHomeGrid(items, playAlbum, handleShuffle);
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

// --- Search (handles both text search and URL paste) ---

async function handleSearch(): Promise<void> {
  const query = getSearchQuery();
  const mode = getSearchMode();

  if (!query) {
    if (mode === "library") await loadHome();
    return;
  }

  // Detect Apple Music URL pasted into search
  const parsed = parseAppleMusicUrl(query);
  if (parsed) {
    await handleUrlAdd(query, parsed);
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

async function handleUrlAdd(
  url: string,
  parsed: { collectionId: string; storefront: string }
): Promise<void> {
  try {
    showSearchStatus("Looking up album...");
    const album = await lookupAlbum(parsed.collectionId, parsed.storefront);
    if (!album) {
      showSearchStatus("Album not found", true);
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

    clearSearchInput();
    showSearchStatus(`Added "${album.collectionName}"`);
    await loadHome();
  } catch (err) {
    showSearchStatus(err instanceof Error ? err.message : "Failed to add", true);
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

  // Main screen listeners
  document.getElementById("shuffle-btn")!.addEventListener("click", handleShuffle);

  // Search with debounce
  document.getElementById("search-input")!.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleSearch, 300);
  });
  document.getElementById("search-mode")!.addEventListener("change", handleSearch);
}

init();
