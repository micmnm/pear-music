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
