import type { ITunesAlbumResult, ITunesSearchResponse } from "../shared/types.js";
import { supabase } from "./supabase.js";
import { getStoredToken } from "./supabase.js";

export async function searchItunes(
  query: string,
  storefront: string = "us"
): Promise<ITunesAlbumResult[]> {
  const token = getStoredToken();
  const response = await supabase.functions.invoke("metadata", {
    body: { action: "search", query, storefront },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.error) throw new Error(response.error.message);
  const data = response.data as ITunesSearchResponse;
  return data.results.filter(
    (r: ITunesAlbumResult) => r.collectionId !== undefined
  );
}

export async function lookupAlbum(
  collectionId: string,
  storefront: string = "us"
): Promise<ITunesAlbumResult | null> {
  const token = getStoredToken();
  const response = await supabase.functions.invoke("metadata", {
    body: { action: "lookup", collectionId, storefront },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.error) throw new Error(response.error.message);
  const data = response.data as ITunesSearchResponse;
  return data.results.length > 0 ? data.results[0] : null;
}

export function artworkUrl(url100: string, size: number = 600): string {
  return url100.replace("100x100bb", `${size}x${size}bb`);
}
