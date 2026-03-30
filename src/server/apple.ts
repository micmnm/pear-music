import { parse as parseHtml } from "node-html-parser";
import { LibraryItem } from "../shared/types.js";

interface ParsedUrl {
  type: "album" | "playlist";
  id: string;
  storefront: string;
}

export function parseAppleMusicUrl(url: string): ParsedUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!parsed.hostname.endsWith("music.apple.com")) return null;

  // Path: /{storefront}/{type}/{slug}/{id}
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 4) return null;

  const [storefront, type, , id] = segments;

  if (type !== "album" && type !== "playlist") return null;

  return { type, id, storefront };
}

export async function fetchMetadata(url: string): Promise<LibraryItem | null> {
  const parsed = parseAppleMusicUrl(url);
  if (!parsed) return null;

  const response = await fetch(url);
  if (!response.ok) return null;

  const html = await response.text();
  const root = parseHtml(html);

  const ogTitle =
    root
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content") ?? "Unknown";
  const ogImage =
    root
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content") ?? "";

  // For albums, OG title is typically "Album Name by Artist"
  let name = ogTitle;
  let artistName: string | null = null;

  if (parsed.type === "album") {
    const byIndex = ogTitle.lastIndexOf(" by ");
    if (byIndex !== -1) {
      name = ogTitle.substring(0, byIndex);
      artistName = ogTitle.substring(byIndex + 4);
    }
  }

  return {
    id: parsed.id,
    type: parsed.type,
    name,
    artistName,
    artworkUrl: ogImage,
    url,
  };
}
