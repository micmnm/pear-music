import type { LibraryItem } from "../shared/types.js";
import { supabase } from "./supabase.js";

export async function getLibrary(): Promise<LibraryItem[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select("*")
    .order("added_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data as LibraryItem[];
}

export async function searchLibrary(query: string): Promise<LibraryItem[]> {
  const { data, error } = await supabase
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("library_items")
    .insert({ ...item, user_id: user.id })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Album already in library");
    throw new Error(error.message);
  }
  return data as LibraryItem;
}

export async function removeFromLibrary(id: string): Promise<void> {
  const { error } = await supabase.from("library_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getRandomItem(): Promise<LibraryItem | null> {
  const items = await getLibrary();
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

export async function getRandomItems(count: number): Promise<LibraryItem[]> {
  const items = await getLibrary();
  // Fisher-Yates shuffle, take first `count`
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
