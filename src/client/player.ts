import type { LibraryItem } from "../shared/types.js";

const EMBED_BASE = "https://embed.music.apple.com";

export function buildEmbedUrl(item: LibraryItem): string {
  return `${EMBED_BASE}/${item.storefront}/album/${item.collection_id}?autoplay=1`;
}

export function loadEmbed(iframe: HTMLIFrameElement, item: LibraryItem): void {
  iframe.src = buildEmbedUrl(item);
}
