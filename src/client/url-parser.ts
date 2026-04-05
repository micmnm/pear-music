import type { ParsedAppleUrl } from "../shared/types.js";

export function parseAppleMusicUrl(url: string): ParsedAppleUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!parsed.hostname.endsWith("music.apple.com")) {
    return null;
  }

  // Path: /{storefront}/album/{slug}/{id}
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 4) return null;

  const [storefront, type, , collectionId] = segments;

  if (type !== "album") return null;

  return { type, collectionId, storefront };
}
