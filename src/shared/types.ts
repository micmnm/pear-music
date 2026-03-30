export interface LibraryItem {
  id: string;
  type: "album" | "playlist";
  name: string;
  artistName: string | null;
  artworkUrl: string;
  url: string;
}

export interface Library {
  items: LibraryItem[];
}
