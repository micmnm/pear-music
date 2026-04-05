import { describe, it, expect } from "vitest";
import { parseAppleMusicUrl } from "../../src/client/url-parser.js";

describe("parseAppleMusicUrl", () => {
  it("parses a standard album URL", () => {
    const result = parseAppleMusicUrl(
      "https://music.apple.com/us/album/ok-computer/1097861387"
    );
    expect(result).toEqual({
      type: "album",
      collectionId: "1097861387",
      storefront: "us",
    });
  });

  it("parses a beta domain URL", () => {
    const result = parseAppleMusicUrl(
      "https://beta.music.apple.com/ro/album/honora/1861644307"
    );
    expect(result).toEqual({
      type: "album",
      collectionId: "1861644307",
      storefront: "ro",
    });
  });

  it("returns null for non-Apple Music URLs", () => {
    expect(parseAppleMusicUrl("https://spotify.com/album/123")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(parseAppleMusicUrl("not a url")).toBeNull();
  });

  it("returns null for URLs with too few path segments", () => {
    expect(parseAppleMusicUrl("https://music.apple.com/us")).toBeNull();
  });

  it("returns null for non-album types", () => {
    expect(
      parseAppleMusicUrl("https://music.apple.com/us/playlist/chill/pl.abc123")
    ).toBeNull();
  });
});
