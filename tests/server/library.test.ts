import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readLibrary, writeLibrary } from "../../src/server/library.js";
import { Library } from "../../src/shared/types.js";
import fs from "node:fs";
import path from "node:path";

const TEST_PATH = path.join("data", "library.test.json");

describe("library", () => {
  beforeEach(() => {
    fs.writeFileSync(TEST_PATH, JSON.stringify({ items: [] }));
  });

  afterEach(() => {
    if (fs.existsSync(TEST_PATH)) fs.unlinkSync(TEST_PATH);
  });

  it("reads an empty library", async () => {
    const lib = await readLibrary(TEST_PATH);
    expect(lib).toEqual({ items: [] });
  });

  it("writes and reads back an item", async () => {
    const lib: Library = {
      items: [
        {
          id: "123",
          type: "album",
          name: "Test Album",
          artistName: "Test Artist",
          artworkUrl: "https://example.com/art.jpg",
          url: "https://music.apple.com/us/album/test/123",
        },
      ],
    };
    await writeLibrary(TEST_PATH, lib);
    const result = await readLibrary(TEST_PATH);
    expect(result).toEqual(lib);
  });

  it("creates file if it does not exist", async () => {
    if (fs.existsSync(TEST_PATH)) fs.unlinkSync(TEST_PATH);
    const lib = await readLibrary(TEST_PATH);
    expect(lib).toEqual({ items: [] });
  });
});
