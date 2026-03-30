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
let isPlaying = false;

async function playShuffle(): Promise<void> {
  try {
    const item = await shuffle();
    showPlayerView(item);
    loadEmbed(iframe, item);
    isPlaying = true;
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
    // Only auto-shuffle if nothing is playing yet
    if (!isPlaying) await playShuffle();
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
