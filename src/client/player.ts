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
