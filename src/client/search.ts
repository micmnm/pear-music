import type { ITunesAlbumResult, ITunesSearchResponse } from "../shared/types.js";
import { supabase } from "./supabase.js";
import { getStorefront } from "./settings.js";

export async function searchItunes(
  query: string,
  storefront?: string
): Promise<ITunesAlbumResult[]> {
  const sf = storefront || await getStorefront();
  const response = await supabase.functions.invoke("metadata", {
    body: { action: "search", query, storefront: sf },
  });

  if (response.error) throw new Error(response.error.message);
  const data = response.data as ITunesSearchResponse;
  return data.results.filter(
    (r: ITunesAlbumResult) => r.collectionId !== undefined
  );
}

export async function lookupAlbum(
  collectionId: string,
  storefront?: string
): Promise<ITunesAlbumResult | null> {
  const sf = storefront || await getStorefront();
  const response = await supabase.functions.invoke("metadata", {
    body: { action: "lookup", collectionId, storefront: sf },
  });

  if (response.error) throw new Error(response.error.message);
  const data = response.data as ITunesSearchResponse;
  return data.results.length > 0 ? data.results[0] : null;
}

export function artworkUrl(url100: string, size: number = 600): string {
  return url100.replace("100x100bb", `${size}x${size}bb`);
}
