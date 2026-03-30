import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createRoutes } from "../../src/server/routes.js";
import fs from "node:fs";
import path from "node:path";

const TEST_PATH = path.join("data", "library.routes-test.json");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", createRoutes(TEST_PATH));
  return app;
}

describe("API routes", () => {
  beforeEach(() => {
    fs.writeFileSync(TEST_PATH, JSON.stringify({ items: [] }));
  });

  afterEach(() => {
    if (fs.existsSync(TEST_PATH)) fs.unlinkSync(TEST_PATH);
    vi.restoreAllMocks();
  });

  describe("GET /api/library", () => {
    it("returns empty library", async () => {
      const res = await request(createApp()).get("/api/library");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
    });

    it("returns library with items", async () => {
      const lib = {
        items: [
          {
            id: "123",
            type: "album",
            name: "Test",
            artistName: "Artist",
            artworkUrl: "https://example.com/art.jpg",
            url: "https://music.apple.com/us/album/test/123",
          },
        ],
      };
      fs.writeFileSync(TEST_PATH, JSON.stringify(lib));
      const res = await request(createApp()).get("/api/library");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(lib);
    });
  });

  describe("POST /api/library", () => {
    it("returns 400 for missing url", async () => {
      const res = await request(createApp())
        .post("/api/library")
        .send({});
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid Apple Music URL", async () => {
      const res = await request(createApp())
        .post("/api/library")
        .send({ url: "https://example.com/not-apple" });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/library/:id", () => {
    it("deletes an item by id", async () => {
      const lib = {
        items: [
          {
            id: "123",
            type: "album",
            name: "Test",
            artistName: "Artist",
            artworkUrl: "https://example.com/art.jpg",
            url: "https://music.apple.com/us/album/test/123",
          },
        ],
      };
      fs.writeFileSync(TEST_PATH, JSON.stringify(lib));
      const res = await request(createApp()).delete("/api/library/123");
      expect(res.status).toBe(200);

      const after = await request(createApp()).get("/api/library");
      expect(after.body.items).toHaveLength(0);
    });

    it("returns 404 for non-existent id", async () => {
      const res = await request(createApp()).delete("/api/library/999");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/shuffle", () => {
    it("returns 404 when library is empty", async () => {
      const res = await request(createApp()).get("/api/shuffle");
      expect(res.status).toBe(404);
    });

    it("returns a random item", async () => {
      const item = {
        id: "123",
        type: "album",
        name: "Test",
        artistName: "Artist",
        artworkUrl: "https://example.com/art.jpg",
        url: "https://music.apple.com/us/album/test/123",
      };
      fs.writeFileSync(TEST_PATH, JSON.stringify({ items: [item] }));
      const res = await request(createApp()).get("/api/shuffle");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(item);
    });
  });
});
