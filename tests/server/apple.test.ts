import { describe, it, expect } from "vitest";
import { parseAppleMusicUrl } from "../../src/server/apple.js";

describe("parseAppleMusicUrl", () => {
  it("parses an album URL", () => {
    const result = parseAppleMusicUrl(
      "https://music.apple.com/us/album/in-rainbows/1109714933"
    );
    expect(result).toEqual({
      type: "album",
      id: "1109714933",
      storefront: "us",
    });
  });

  it("parses a playlist URL", () => {
    const result = parseAppleMusicUrl(
      "https://music.apple.com/us/playlist/chill-vibes/pl.abc123"
    );
    expect(result).toEqual({
      type: "playlist",
      id: "pl.abc123",
      storefront: "us",
    });
  });

  it("parses a URL with query params", () => {
    const result = parseAppleMusicUrl(
      "https://music.apple.com/gb/album/ok-computer/1097861387?l=en"
    );
    expect(result).toEqual({
      type: "album",
      id: "1097861387",
      storefront: "gb",
    });
  });

  it("parses a beta.music.apple.com URL", () => {
    const result = parseAppleMusicUrl(
      "https://beta.music.apple.com/ro/album/honora/1861644307"
    );
    expect(result).toEqual({
      type: "album",
      id: "1861644307",
      storefront: "ro",
    });
  });

  it("returns null for invalid URL", () => {
    const result = parseAppleMusicUrl("https://example.com/not-apple");
    expect(result).toBeNull();
  });

  it("returns null for non-album/playlist URL", () => {
    const result = parseAppleMusicUrl(
      "https://music.apple.com/us/artist/radiohead/657515"
    );
    expect(result).toBeNull();
  });
});

import { fetchMetadata } from "../../src/server/apple.js";
import { vi } from "vitest";

describe("fetchMetadata", () => {
  it("fetches and parses OG tags for an album", async () => {
    const mockHtml = `
      <html><head>
        <meta property="og:title" content="In Rainbows by Radiohead">
        <meta property="og:image" content="https://is1-ssl.mzstatic.com/image/art.jpg">
      </head></html>
    `;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      })
    );

    const result = await fetchMetadata(
      "https://music.apple.com/us/album/in-rainbows/1109714933"
    );
    expect(result).toEqual({
      id: "1109714933",
      type: "album",
      name: "In Rainbows",
      artistName: "Radiohead",
      artworkUrl: "https://is1-ssl.mzstatic.com/image/art.jpg",
      url: "https://music.apple.com/us/album/in-rainbows/1109714933",
    });

    vi.restoreAllMocks();
  });

  it("fetches and parses OG tags for a playlist", async () => {
    const mockHtml = `
      <html><head>
        <meta property="og:title" content="Chill Vibes">
        <meta property="og:image" content="https://is1-ssl.mzstatic.com/image/playlist.jpg">
      </head></html>
    `;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      })
    );

    const result = await fetchMetadata(
      "https://music.apple.com/us/playlist/chill-vibes/pl.abc123"
    );
    expect(result).toEqual({
      id: "pl.abc123",
      type: "playlist",
      name: "Chill Vibes",
      artistName: null,
      artworkUrl: "https://is1-ssl.mzstatic.com/image/playlist.jpg",
      url: "https://music.apple.com/us/playlist/chill-vibes/pl.abc123",
    });

    vi.restoreAllMocks();
  });

  it("returns null for invalid URL", async () => {
    const result = await fetchMetadata("https://example.com/not-apple");
    expect(result).toBeNull();
  });
});
