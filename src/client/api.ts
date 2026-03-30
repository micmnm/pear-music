import type { Library, LibraryItem } from "../shared/types.js";

const BASE = "/api";

export async function getLibrary(): Promise<Library> {
  const res = await fetch(`${BASE}/library`);
  if (!res.ok) throw new Error("Failed to fetch library");
  return res.json();
}

export async function addItem(url: string): Promise<LibraryItem> {
  const res = await fetch(`${BASE}/library`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to add item");
  }
  return res.json();
}

export async function deleteItem(id: string): Promise<void> {
  const res = await fetch(`${BASE}/library/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete item");
}

export async function shuffle(): Promise<LibraryItem> {
  const res = await fetch(`${BASE}/shuffle`);
  if (!res.ok) throw new Error("Library is empty");
  return res.json();
}
