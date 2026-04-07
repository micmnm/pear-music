export interface LibraryItem {
  id: string;
  user_id: string;
  collection_id: number;
  name: string;
  artist_name: string;
  artwork_url: string;
  storefront: string;
  genre: string | null;
  release_date: string | null;
  url: string | null;
  added_at: string;
}

export interface ParsedAppleUrl {
  type: "album";
  collectionId: string;
  storefront: string;
}

export interface ITunesAlbumResult {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl100: string;
  primaryGenreName: string;
  releaseDate: string;
  country: string;
}

export interface ITunesSearchResponse {
  resultCount: number;
  results: ITunesAlbumResult[];
}

export type UserStatus = "pending_approval" | "active" | "rejected";

export type AppState =
  | "signup"
  | "login"
  | "waitlist"
  | "rejected"
  | "active";

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  status: UserStatus;
  is_admin: boolean;
  approved_at: string | null;
  created_at: string;
}

export interface AdminUserRow extends User {
  album_count: number;
}

export interface AppSettings {
  id: 1;
  max_active_users: number;
  updated_at: string;
}
