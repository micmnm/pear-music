import type { LibraryItem } from "../shared/types.js";
import { getAuthenticatedClient } from "./supabase.js";

export async function getLibrary(): Promise<LibraryItem[]> {
  const client = getAuthenticatedClient();
  const { data, error } = await client
    .from("library_items")
    .select("*")
    .order("added_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data as LibraryItem[];
}

export async function searchLibrary(query: string): Promise<LibraryItem[]> {
  const client = getAuthenticatedClient();
  const { data, error } = await client
    .from("library_items")
    .select("*")
    .or(`name.ilike.%${query}%,artist_name.ilike.%${query}%`)
    .order("name");

  if (error) throw new Error(error.message);
  return data as LibraryItem[];
}

export async function addToLibrary(item: {
  collection_id: number;
  name: string;
  artist_name: string;
  artwork_url: string;
  storefront: string;
  genre: string | null;
  release_date: string | null;
  url: string | null;
}): Promise<LibraryItem> {
  const client = getAuthenticatedClient();
  const token = localStorage.getItem("pear_music_jwt");
  const payload = JSON.parse(atob(token!.split(".")[1]));
  const user_id = payload.sub;

  const { data, error } = await client
    .from("library_items")
    .insert({ ...item, user_id })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Album already in library");
    throw new Error(error.message);
  }
  return data as LibraryItem;
}

export async function removeFromLibrary(id: string): Promise<void> {
  const client = getAuthenticatedClient();
  const { error } = await client.from("library_items").delete().eq("id", id);

  if (error) throw new Error(error.message);
}

export async function getRandomItem(): Promise<LibraryItem | null> {
  const items = await getLibrary();
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}
