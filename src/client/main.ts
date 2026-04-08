import { checkAppState, register, login, logout } from "./auth.js";
import { getLibrary, searchLibrary, addToLibrary, removeFromLibrary, getRandomItem, getRandomItems } from "./library.js";
import { searchItunes, lookupAlbum } from "./search.js";
import { parseAppleMusicUrl } from "./url-parser.js";
import { loadEmbed } from "./player.js";
import { getStorefront } from "./settings.js";
import {
  showScreen,
  showPlayer,
  getSignupEmail,
  showAuthError,
  hideAuthError,
  getSearchQuery,
  getSearchMode,
  clearSearchInput,
  showSearchStatus,
  renderHomeGrid,
  renderAlbumGrid,
  renderItunesResults,
  showAdminLink,
  setUserEmail,
  showPendingBanner,
  showSignupSlots,
  setAdminCapacity,
  setAdminMaxInput,
  getAdminMaxInput,
  showAdminPendingBanner,
  renderAdminUsers,
} from "./ui.js";
import {
  listUsers,
  approveUser,
  rejectUser,
  deleteUser,
  setMaxActiveUsers,
  getMaxActiveUsers,
  getActiveUserCount,
  getPendingUserCount,
} from "./admin.js";
import { supabase } from "./supabase.js";
import type { LibraryItem, ITunesAlbumResult } from "../shared/types.js";
import "./style.css";

const iframe = document.getElementById("apple-embed") as HTMLIFrameElement;
let debounceTimer: ReturnType<typeof setTimeout>;

// --- Auth ---

async function handleSignup(): Promise<void> {
  const email = getSignupEmail();
  if (!email || !email.includes("@")) {
    showAuthError("Please enter a valid email");
    return;
  }
  try {
    hideAuthError();
    const result = await register(email);
    if (result.status === "active") {
      await initMainScreen();
    } else if (result.status === "pending_approval") {
      showScreen("waitlist");
    } else {
      showScreen("rejected");
    }
  } catch (err) {
    showAuthError(err instanceof Error ? err.message : "Registration failed");
  }
}

async function handleLogin(): Promise<void> {
  try {
    document.getElementById("auth-error-login")!.classList.add("hidden");
    const result = await login();
    if (result.status === "active") {
      await initMainScreen();
    } else if (result.status === "pending_approval") {
      showScreen("waitlist");
    }
    // 'rejected' is impossible — login() throws for rejected users
  } catch (err) {
    const el = document.getElementById("auth-error-login")!;
    el.textContent = err instanceof Error ? err.message : "Login failed";
    el.classList.remove("hidden");
  }
}

// --- Main screen ---

async function initMainScreen(): Promise<void> {
  showScreen("main");

  // Look up own profile to decide whether to show the admin link
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const { data: me } = await supabase
      .from("users")
      .select("email, is_admin")
      .eq("id", session.user.id)
      .single();
    if (me?.email) setUserEmail(me.email);
    showAdminLink(!!me?.is_admin);

    if (me?.is_admin) {
      const pending = await getPendingUserCount();
      showPendingBanner(pending);
    }
  }

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
  await loadHome();
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
    const storefront = await getStorefront();
    const album = await lookupAlbum(parsed.collectionId, storefront);
    if (!album) {
      showSearchStatus("Album not found", true);
      return;
    }

    await addToLibrary({
      collection_id: album.collectionId,
      name: album.collectionName,
      artist_name: album.artistName,
      artwork_url: album.artworkUrl100,
      storefront,
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
    const storefront = await getStorefront();
    await addToLibrary({
      collection_id: result.collectionId,
      name: result.collectionName,
      artist_name: result.artistName,
      artwork_url: result.artworkUrl100,
      storefront,
      genre: result.primaryGenreName || null,
      release_date: result.releaseDate || null,
      url: null,
    });
  } catch (err) {
    console.warn("Add failed:", err);
  }
}

// --- Admin page ---

async function showAdminPage(): Promise<void> {
  showScreen("admin");
  await refreshAdminPage();
}

async function refreshAdminPage(): Promise<void> {
  try {
    const [users, max, active, pending] = await Promise.all([
      listUsers(),
      getMaxActiveUsers(),
      getActiveUserCount(),
      getPendingUserCount(),
    ]);

    setAdminCapacity(active, max);
    setAdminMaxInput(max);
    showAdminPendingBanner(pending);

    renderAdminUsers(users, {
      onApprove: async (id) => {
        try {
          await approveUser(id);
          await refreshAdminPage();
        } catch (err) {
          alert(`Approve failed: ${err instanceof Error ? err.message : "unknown"}`);
        }
      },
      onReject: async (id) => {
        try {
          await rejectUser(id);
          await refreshAdminPage();
        } catch (err) {
          alert(`Reject failed: ${err instanceof Error ? err.message : "unknown"}`);
        }
      },
      onDelete: async (id) => {
        try {
          await deleteUser(id);
          await refreshAdminPage();
        } catch (err) {
          alert(`Delete failed: ${err instanceof Error ? err.message : "unknown"}`);
        }
      },
    });
  } catch (err) {
    document.getElementById("admin-users-error")!.textContent =
      err instanceof Error ? err.message : "Failed to load users";
    document.getElementById("admin-users-error")!.classList.remove("hidden");
  }
}

async function handleSaveMaxActiveUsers(): Promise<void> {
  const value = getAdminMaxInput();
  try {
    document.getElementById("admin-settings-error")!.classList.add("hidden");
    await setMaxActiveUsers(value);
    await refreshAdminPage();
  } catch (err) {
    const el = document.getElementById("admin-settings-error")!;
    el.textContent = err instanceof Error ? err.message : "Save failed";
    el.classList.remove("hidden");
  }
}

async function handleWaitlistLogout(): Promise<void> {
  await logout();
  location.reload();
}

async function handleLogout(): Promise<void> {
  await logout();
  location.reload();
}

async function refreshSignupSlots(): Promise<void> {
  try {
    const [active, max] = await Promise.all([
      getActiveUserCount(),
      getMaxActiveUsers(),
    ]);
    showSignupSlots(active, max);
  } catch {
    // Non-fatal — just don't show the hint
  }
}

// --- Init ---

async function init(): Promise<void> {
  // --- Wire ALL event listeners up front. Clicking hidden elements is a no-op. ---

  // Signup screen
  document.getElementById("signup-btn")!.addEventListener("click", handleSignup);
  document.getElementById("signup-email")!.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSignup();
  });
  document.getElementById("signup-to-login")!.addEventListener("click", (e) => {
    e.preventDefault();
    showScreen("login");
  });

  // Login screen
  document.getElementById("login-btn")!.addEventListener("click", handleLogin);
  document.getElementById("login-to-signup")!.addEventListener("click", async (e) => {
    e.preventDefault();
    showScreen("signup");
    await refreshSignupSlots();
  });

  // Waitlist screen
  document.getElementById("waitlist-logout")!.addEventListener("click", handleWaitlistLogout);

  // Main screen
  document.getElementById("shuffle-btn")!.addEventListener("click", handleShuffle);
  document.getElementById("admin-link")!.addEventListener("click", showAdminPage);
  document.getElementById("logout-btn")!.addEventListener("click", handleLogout);
  document.getElementById("search-input")!.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleSearch, 300);
  });
  document.getElementById("search-mode")!.addEventListener("change", handleSearch);

  // Admin screen
  document.getElementById("admin-back-btn")!.addEventListener("click", initMainScreen);
  document.getElementById("admin-max-save")!.addEventListener("click", handleSaveMaxActiveUsers);

  // --- Now route to the initial screen based on app state ---

  const state = await checkAppState();

  if (state === "signup") {
    showScreen("signup");
    await refreshSignupSlots();
  } else if (state === "login") {
    showScreen("login");
  } else if (state === "waitlist") {
    showScreen("waitlist");
  } else if (state === "rejected") {
    showScreen("rejected");
  } else {
    await initMainScreen();
  }
}

init();
